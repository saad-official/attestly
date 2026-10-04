import "server-only";
import * as chunksRepo from "@/lib/db/repositories/chunks";
import * as libraryRepo from "@/lib/db/repositories/libraryAnswers";
import * as shareLinksRepo from "@/lib/db/repositories/shareLinks";
import { optionalEnv } from "@/lib/env";
import { errorMessage } from "./errors";
import { audit, chunkEmbeddingText, documentEmbedder, queryEmbedder, type ServiceDeps } from "./shared";

/**
 * Daily job (spec 3.8, /api/cron/daily): purge expired share links and fill
 * in embeddings that failed at upload/approval time (chunks and library
 * answers with a null vector), in batches of 100 across all orgs.
 */

export const REEMBED_BATCH = 100;
/** Batches per kind per run, so the job finishes well inside maxDuration. */
const MAX_BATCHES = 5;

export type DailyMaintenanceResult = {
  purgedShareLinks: number;
  chunks: { embedded: number; failed: number };
  libraryAnswers: { embedded: number; failed: number };
  /** Why re-embedding was skipped (no Gemini key), if it was. */
  skipped: string | null;
  errors: string[];
  durationMs: number;
};

export type DailyMaintenanceOptions = ServiceDeps & {
  now?: Date;
  maxBatches?: number;
};

async function reembed<T extends { id: string; orgId: string }>(
  list: () => Promise<T[]>,
  text: (row: T) => string,
  embed: (texts: string[]) => Promise<number[][]>,
  save: (row: T, vector: number[]) => Promise<boolean>,
  maxBatches: number,
  errors: string[],
): Promise<{ embedded: number; failed: number }> {
  let embedded = 0;
  let failed = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await list();
    if (rows.length === 0) break;
    let vectors: number[][];
    try {
      vectors = await embed(rows.map(text));
    } catch (error) {
      failed += rows.length;
      errors.push(errorMessage(error));
      break; // The provider is failing; the next run retries.
    }
    for (let i = 0; i < rows.length; i++) {
      try {
        if (await save(rows[i], vectors[i])) embedded += 1;
      } catch (error) {
        failed += 1;
        errors.push(errorMessage(error));
      }
    }
    if (rows.length < REEMBED_BATCH) break;
  }
  return { embedded, failed };
}

export async function runDailyMaintenance(options: DailyMaintenanceOptions = {}): Promise<DailyMaintenanceResult> {
  const started = Date.now();
  const errors: string[] = [];
  const maxBatches = options.maxBatches ?? MAX_BATCHES;

  let purgedShareLinks = 0;
  try {
    purgedShareLinks = await shareLinksRepo.purgeExpired(options.now ?? new Date());
  } catch (error) {
    errors.push(`share links: ${errorMessage(error)}`);
  }

  const canEmbed = Boolean(options.embedder || options.queryEmbedder || optionalEnv("GOOGLE_GENERATIVE_AI_API_KEY"));
  let chunks = { embedded: 0, failed: 0 };
  let libraryAnswers = { embedded: 0, failed: 0 };
  if (canEmbed) {
    const docs = documentEmbedder(options);
    const queries = queryEmbedder(options);
    chunks = await reembed(
      () => chunksRepo.listMissingEmbeddings(null, REEMBED_BATCH),
      (row) => chunkEmbeddingText(row.headingPath, row.text),
      (texts) => docs.embed(texts),
      (row, vector) => chunksRepo.setEmbedding(row.orgId, row.id, vector),
      maxBatches,
      errors,
    );
    libraryAnswers = await reembed(
      () => libraryRepo.listMissingEmbeddings(null, REEMBED_BATCH),
      (row) => row.question,
      (texts) => queries.embed(texts),
      (row, vector) => libraryRepo.setEmbedding(row.orgId, row.id, vector),
      maxBatches,
      errors,
    );
  }

  const result: DailyMaintenanceResult = {
    purgedShareLinks,
    chunks,
    libraryAnswers,
    skipped: canEmbed ? null : "GOOGLE_GENERATIVE_AI_API_KEY is not set; embeddings were not retried.",
    errors: [...new Set(errors)].slice(0, 20),
    durationMs: Date.now() - started,
  };
  await audit({
    orgId: null,
    actor: "cron",
    type: "cron.daily",
    output: {
      purgedShareLinks,
      chunks,
      libraryAnswers,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });
  return result;
}
