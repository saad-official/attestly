import "server-only";
import { logAgentEvent, type AgentEventInput } from "@/lib/ai/log";
import { getDb } from "@/lib/db/client";
import { DEMO_POLICIES } from "@/lib/demo/policies";
import { DEMO_CUSTOMER, DEMO_QUESTIONNAIRE_FILE_NAME, DEMO_QUESTIONNAIRE_NAME } from "@/lib/demo/questionnaire";
import type { DraftGenerator } from "@/lib/draft/draft";
import { createGeminiEmbedder, type Embedder, type GeminiTaskType } from "@/lib/rag/embeddings";

/**
 * Injectable dependencies shared by the services. Production leaves them
 * unset (Gemini embeddings, Groq/Gemini drafting); tests pass
 * `createFakeEmbedder()` and a fake drafter so nothing touches the network.
 */
export type ServiceDeps = {
  /** Embeds everything (documents, questions, library) when set; tests use createFakeEmbedder(). */
  embedder?: Embedder;
  /** Overrides `embedder` for query-side texts (questions, library questions). */
  queryEmbedder?: Embedder;
};

const defaults = new Map<GeminiTaskType, Embedder>();

function gemini(taskType: GeminiTaskType): Embedder {
  let embedder = defaults.get(taskType);
  if (!embedder) {
    embedder = createGeminiEmbedder({ taskType });
    defaults.set(taskType, embedder);
  }
  return embedder;
}

/** Knowledge-base passages (RETRIEVAL_DOCUMENT). */
export function documentEmbedder(deps?: ServiceDeps): Embedder {
  return deps?.embedder ?? gemini("RETRIEVAL_DOCUMENT");
}

/**
 * Question-side texts: questionnaire questions at draft time, library
 * questions (matched question-to-question) and knowledge-gap clustering.
 */
export function queryEmbedder(deps?: ServiceDeps): Embedder {
  return deps?.queryEmbedder ?? deps?.embedder ?? gemini("RETRIEVAL_QUERY");
}

export type { DraftGenerator, Embedder };

/** Embeds texts in fixed-size batches (the Gemini embedder batches too; fakes may not). */
export async function embedInBatches(embedder: Embedder, texts: string[], batchSize = 32): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    out.push(...(await embedder.embed(texts.slice(i, i + batchSize))));
  }
  return out;
}

/** The text a chunk is embedded from: its heading trail, then the passage. Shared with the cron re-embed. */
export function chunkEmbeddingText(headingPath: readonly string[], text: string): string {
  const trail = headingPath.filter(Boolean).join(" > ");
  return trail ? `${trail}\n\n${text}` : text;
}

/** Audit log; never throws (logAgentEvent swallows its own errors, this also covers getDb). */
export async function audit(event: AgentEventInput): Promise<void> {
  try {
    await logAgentEvent(await getDb(), event);
  } catch (error) {
    console.error("[agent_events] audit failed", error instanceof Error ? error.message : error);
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Demo workspace markers (spec 3.7). Demo content is exempt from Free limits.

/** Every demo policy carries this sentence (lib/demo/policies.ts SYNTHETIC_NOTE). */
export const DEMO_DOCUMENT_MARKER = "created for the Attestly demo workspace";
const DEMO_TITLES = new Set(DEMO_POLICIES.map((p) => p.title));

export function isDemoDocument(doc: { title: string; text: string }): boolean {
  return DEMO_TITLES.has(doc.title) && doc.text.includes(DEMO_DOCUMENT_MARKER);
}

export function isDemoQuestionnaire(q: { name: string; fileName: string; customer: string | null }): boolean {
  return q.fileName === DEMO_QUESTIONNAIRE_FILE_NAME && q.name === DEMO_QUESTIONNAIRE_NAME && q.customer === DEMO_CUSTOMER;
}
