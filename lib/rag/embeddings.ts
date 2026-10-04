/**
 * Embeddings (spec 3.1). Callers depend on the `Embedder` interface; the
 * Gemini implementation goes through the AI SDK and the fake one is a
 * deterministic hashing embedder for tests and key-less demos.
 *
 * Vectors are 768-dimensional and L2-normalised (Gemini only returns unit
 * vectors at its full 3072 dimensions, so truncated outputs are normalised
 * here before they reach pgvector's cosine index).
 */
import { createGoogle } from "@ai-sdk/google";
import { embedMany } from "ai";
import { requireEnv } from "@/lib/env";

export interface Embedder {
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_BATCH_SIZE = 32;
export const GEMINI_EMBEDDING_MODEL_ID = "gemini-embedding-001";

export class EmbeddingError extends Error {
  readonly isRetryable = false;
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export function l2Normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  if (length === 0 || !Number.isFinite(length)) return vector.map(() => 0);
  return vector.map((x) => x / length);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new EmbeddingError(`Vector size mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export type RetryOptions = {
  /** Total attempts per batch, including the first. Default 4. */
  maxAttempts?: number;
  /** First backoff delay; doubles each retry. Default 500 ms. */
  baseDelayMs?: number;
  /** Upper bound for a single delay. Default 8 s. */
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** AI SDK errors expose `isRetryable`; anything else is treated as transient. */
function isRetryable(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "isRetryable" in error) {
    return error.isRetryable !== false;
  }
  return true;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4);
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) break;
      await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export type BatchedEmbedderOptions = RetryOptions & {
  dimensions: number;
  /** Embeds one batch; must return one vector per input, in order. */
  embedBatch: (texts: string[]) => Promise<number[][]>;
  batchSize?: number;
  /** L2-normalise every vector. Default false (callers opt in). */
  normalize?: boolean;
};

/** Batching, retries and shape validation around any batch embedding call. */
export function createBatchedEmbedder(options: BatchedEmbedderOptions): Embedder {
  const { dimensions, embedBatch, normalize = false } = options;
  const batchSize = Math.max(1, options.batchSize ?? EMBEDDING_BATCH_SIZE);
  return {
    dimensions,
    async embed(texts) {
      const out: number[][] = [];
      for (let start = 0; start < texts.length; start += batchSize) {
        const batch = texts.slice(start, start + batchSize);
        const vectors = await withRetry(() => embedBatch(batch), options);
        if (vectors.length !== batch.length) {
          throw new EmbeddingError(`Embedding model returned ${vectors.length} vectors for ${batch.length} inputs.`);
        }
        for (const vector of vectors) {
          if (vector.length !== dimensions) {
            throw new EmbeddingError(`Embedding has ${vector.length} values; expected ${dimensions} dimensions.`);
          }
          out.push(normalize ? l2Normalize(vector) : vector);
        }
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Gemini via the AI SDK

export type GeminiTaskType =
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING"
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "QUESTION_ANSWERING"
  | "FACT_VERIFICATION";

type GeminiEmbeddingModel = ReturnType<ReturnType<typeof createGoogle>["embeddingModel"]>;

type GeminiProviderOptions = {
  google: { outputDimensionality: number; taskType?: GeminiTaskType };
};

/** The subset of the AI SDK's `embedMany` this module uses (injectable for tests). */
export type EmbedManyFn = (args: {
  model: GeminiEmbeddingModel;
  values: string[];
  providerOptions: GeminiProviderOptions;
  maxRetries: number;
}) => Promise<{ embeddings: number[][] }>;

export type GeminiEmbedderOptions = RetryOptions & {
  /** Defaults to GOOGLE_GENERATIVE_AI_API_KEY, read on first use. */
  apiKey?: string;
  modelId?: string;
  /** Use RETRIEVAL_DOCUMENT for chunks and RETRIEVAL_QUERY for questions. */
  taskType?: GeminiTaskType;
  batchSize?: number;
  embedMany?: EmbedManyFn;
};

export function createGeminiEmbedder(options: GeminiEmbedderOptions = {}): Embedder {
  const modelId = options.modelId ?? GEMINI_EMBEDDING_MODEL_ID;
  const callEmbedMany: EmbedManyFn = options.embedMany ?? embedMany;
  let model: GeminiEmbeddingModel | undefined;
  const providerOptions: GeminiProviderOptions = {
    google: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      ...(options.taskType ? { taskType: options.taskType } : {}),
    },
  };

  return createBatchedEmbedder({
    ...options,
    dimensions: EMBEDDING_DIMENSIONS,
    normalize: true,
    embedBatch: async (values) => {
      model ??= createGoogle({
        apiKey: options.apiKey ?? requireEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
      }).embeddingModel(modelId);
      // Retries are handled by createBatchedEmbedder so backoff is uniform.
      const result = await callEmbedMany({ model, values, providerOptions, maxRetries: 0 });
      return result.embeddings;
    },
  });
}

// ---------------------------------------------------------------------------
// Deterministic fake

const STOPWORDS = new Set(
  "a an and are as at be by can do does for from has have how i if in is it its of on or our please the their there this to we what when which who will with you your".split(
    " ",
  ),
);

/** FNV-1a 32-bit. */
function fnv1a(text: string, seed = 0x811c9dc5): number {
  let hash = seed;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fakeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/**
 * Hashes each content word (plus a crude 5-letter stem, so "backup" and
 * "backups" collide) into a signed bucket and L2-normalises. Overlapping
 * vocabulary gives high cosine similarity; no network, no key.
 */
export function createFakeEmbedder(dimensions = EMBEDDING_DIMENSIONS): Embedder {
  const embedOne = (text: string): number[] => {
    const vector = new Array<number>(dimensions).fill(0);
    for (const token of fakeTokens(text)) {
      for (const feature of new Set([token, `~${token.slice(0, 5)}`])) {
        const h = fnv1a(feature);
        vector[h % dimensions] += (h & 0x80000000) === 0 ? 1 : -1;
      }
    }
    if (!vector.some((x) => x !== 0)) vector[0] = 1;
    return l2Normalize(vector);
  };
  return {
    dimensions,
    async embed(texts) {
      return texts.map(embedOne);
    },
  };
}
