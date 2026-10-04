import { describe, expect, it } from "vitest";
import {
  EmbeddingError,
  cosineSimilarity,
  createBatchedEmbedder,
  createFakeEmbedder,
  createGeminiEmbedder,
  type EmbedManyFn,
} from "@/lib/rag/embeddings";

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("createFakeEmbedder", () => {
  const embedder = createFakeEmbedder();

  it("returns deterministic unit vectors of the requested size", async () => {
    const [a, b] = await embedder.embed(["MFA is required", "MFA is required"]);
    expect(embedder.dimensions).toBe(768);
    expect(a).toHaveLength(768);
    expect(a).toEqual(b);
    expect(norm(a)).toBeCloseTo(1, 10);
    const [small] = await createFakeEmbedder(16).embed(["hello"]);
    expect(small).toHaveLength(16);
  });

  it("ignores case and punctuation", async () => {
    const [a, b] = await embedder.embed(["Encrypted backups!", "encrypted   BACKUPS"]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it("ranks overlapping texts above unrelated ones", async () => {
    const [q, near, far] = await embedder.embed([
      "How long are encrypted backups retained?",
      "Encrypted backups are retained for 35 days.",
      "Visitors sign the reception logbook.",
    ]);
    expect(cosineSimilarity(q, near)).toBeGreaterThan(cosineSimilarity(q, far));
  });

  it("gives empty text a valid unit vector", async () => {
    const [v] = await embedder.embed([""]);
    expect(norm(v)).toBeCloseTo(1, 10);
  });
});

describe("createBatchedEmbedder", () => {
  const vec = (n: number) => [n, 0, 0];

  it("embeds in batches of 32 and keeps input order", async () => {
    const calls: string[][] = [];
    const embedder = createBatchedEmbedder({
      dimensions: 3,
      embedBatch: async (texts) => {
        calls.push(texts);
        return texts.map((t) => vec(Number(t)));
      },
    });
    const texts = Array.from({ length: 70 }, (_, i) => String(i + 1));
    const out = await embedder.embed(texts);
    expect(calls.map((c) => c.length)).toEqual([32, 32, 6]);
    expect(out.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it("does not call the model for an empty list", async () => {
    let called = false;
    const embedder = createBatchedEmbedder({
      dimensions: 3,
      embedBatch: async () => {
        called = true;
        return [];
      },
    });
    expect(await embedder.embed([])).toEqual([]);
    expect(called).toBe(false);
  });

  it("retries transient failures with exponential backoff", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const embedder = createBatchedEmbedder({
      dimensions: 3,
      baseDelayMs: 100,
      sleep: async (ms) => {
        delays.push(ms);
      },
      embedBatch: async (texts) => {
        attempts += 1;
        if (attempts < 3) throw new Error("429 Too Many Requests");
        return texts.map(() => vec(1));
      },
    });
    await expect(embedder.embed(["a"])).resolves.toEqual([[1, 0, 0]]);
    expect(delays).toEqual([100, 200]);
  });

  it("gives up after maxAttempts and rethrows the last error", async () => {
    let attempts = 0;
    const embedder = createBatchedEmbedder({
      dimensions: 3,
      maxAttempts: 3,
      sleep: async () => {},
      embedBatch: async () => {
        attempts += 1;
        throw new Error(`boom ${attempts}`);
      },
    });
    await expect(embedder.embed(["a"])).rejects.toThrow("boom 3");
    expect(attempts).toBe(3);
  });

  it("does not retry errors marked non-retryable (e.g. a bad API key)", async () => {
    let attempts = 0;
    const embedder = createBatchedEmbedder({
      dimensions: 3,
      sleep: async () => {},
      embedBatch: async () => {
        attempts += 1;
        throw Object.assign(new Error("API key not valid"), { isRetryable: false });
      },
    });
    await expect(embedder.embed(["a"])).rejects.toThrow("API key not valid");
    expect(attempts).toBe(1);
  });

  it("rejects responses with the wrong count or dimension", async () => {
    const wrongCount = createBatchedEmbedder({ dimensions: 3, embedBatch: async () => [vec(1)] });
    await expect(wrongCount.embed(["a", "b"])).rejects.toBeInstanceOf(EmbeddingError);
    const wrongDim = createBatchedEmbedder({ dimensions: 3, embedBatch: async () => [[1, 2]] });
    await expect(wrongDim.embed(["a"])).rejects.toThrow(/expected 3 dimensions/);
  });
});

describe("createGeminiEmbedder", () => {
  it("calls embedMany with the Gemini embedding model and 768 output dimensions", async () => {
    const seen: Array<Parameters<EmbedManyFn>[0]> = [];
    const fakeEmbedMany: EmbedManyFn = async (args) => {
      seen.push(args);
      return { embeddings: args.values.map(() => Array.from({ length: 768 }, () => 2)) };
    };
    const embedder = createGeminiEmbedder({ apiKey: "test-key", taskType: "RETRIEVAL_DOCUMENT", embedMany: fakeEmbedMany });
    const out = await embedder.embed(Array.from({ length: 40 }, (_, i) => `text ${i}`));

    expect(embedder.dimensions).toBe(768);
    expect(seen.map((s) => s.values.length)).toEqual([32, 8]);
    const first = seen[0];
    expect(first.providerOptions).toEqual({ google: { outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" } });
    expect(first.maxRetries).toBe(0);
    expect(typeof first.model === "object" && first.model.modelId).toBe("gemini-embedding-001");
    // Truncated Gemini embeddings are not unit length; the embedder normalises them.
    expect(norm(out[0])).toBeCloseTo(1, 10);
  });

  it("omits taskType when not set", async () => {
    let options: unknown;
    const embedder = createGeminiEmbedder({
      apiKey: "test-key",
      embedMany: async (args) => {
        options = args.providerOptions;
        return { embeddings: args.values.map(() => Array.from({ length: 768 }, () => 1)) };
      },
    });
    await embedder.embed(["a"]);
    expect(options).toEqual({ google: { outputDimensionality: 768 } });
  });
});
