import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "../client";
import { chunks, documents } from "../schema";
import { assertDocumentInOrg, checkedEmbedding, clampLimit, toVectorLiteral } from "./shared";

/**
 * Chunks of knowledge-base documents, with pgvector and full-text search.
 * Searches only cover current documents: status 'ready' and not superseded.
 */

export type NewChunkInput = {
  position: number;
  headingPath?: string[];
  text: string;
  tokenCount?: number;
  /** 768 numbers; omit/null to embed later (the cron retries missing embeddings). */
  embedding?: number[] | null;
};

/** A chunk as retrieval returns it (no embedding), with its document title for citations. */
export type ChunkHit = {
  id: string;
  documentId: string;
  documentTitle: string;
  position: number;
  headingPath: string[];
  text: string;
  tokenCount: number;
  /**
   * Higher is better. Embedding search: cosine similarity (1 - cosine
   * distance, -1..1). Keyword search: ts_rank.
   */
  score: number;
};

const hitColumns = {
  id: chunks.id,
  documentId: chunks.documentId,
  documentTitle: documents.title,
  position: chunks.position,
  headingPath: chunks.headingPath,
  text: chunks.text,
  tokenCount: chunks.tokenCount,
};

/** Rows per INSERT: each embedding is one ~10 KB text parameter. */
const INSERT_BATCH = 100;

export async function bulkInsert(orgId: string, documentId: string, rows: NewChunkInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDb();
  await assertDocumentInOrg(db, orgId, documentId);
  const values = rows.map((row) => ({
    documentId,
    orgId,
    position: row.position,
    headingPath: row.headingPath ?? [],
    text: row.text,
    tokenCount: row.tokenCount ?? 0,
    embedding: row.embedding ? checkedEmbedding(row.embedding) : null,
  }));
  await db.transaction(async (tx) => {
    for (let i = 0; i < values.length; i += INSERT_BATCH) {
      await tx.insert(chunks).values(values.slice(i, i + INSERT_BATCH));
    }
  });
  return values.length;
}

export async function deleteForDocument(orgId: string, documentId: string): Promise<number> {
  const db = await getDb();
  const deleted = await db
    .delete(chunks)
    .where(and(eq(chunks.documentId, documentId), eq(chunks.orgId, orgId)))
    .returning({ id: chunks.id });
  return deleted.length;
}

/** Chunks of one document in order (no embeddings). */
export async function listForDocument(orgId: string, documentId: string) {
  const db = await getDb();
  return db
    .select(hitColumns)
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(eq(chunks.documentId, documentId), eq(chunks.orgId, orgId)))
    .orderBy(asc(chunks.position));
}

/** Citation lookup (guardrails, citation panel). Includes superseded documents, so old citations resolve. */
export async function getByIds(orgId: string, ids: string[]): Promise<Omit<ChunkHit, "score">[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db
    .select(hitColumns)
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(eq(chunks.orgId, orgId), inArray(chunks.id, [...new Set(ids)])));
}

const searchable = (orgId: string): SQL =>
  and(eq(chunks.orgId, orgId), eq(documents.status, "ready"), isNull(documents.supersededAt)) as SQL;

/**
 * Nearest chunks by cosine distance (`<=>`), nearest first. Uses the HNSW
 * index; `hnsw.iterative_scan = strict_order` (pgvector >= 0.8) keeps
 * scanning when the org filter discards candidates, so a small org in a
 * large shared index still gets `limit` results in exact order.
 */
export async function searchByEmbedding(orgId: string, embedding: number[], limit = 8): Promise<ChunkHit[]> {
  const vector = toVectorLiteral(embedding);
  const distance = sql<number>`(${chunks.embedding} <=> ${vector}::vector)`;
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local hnsw.iterative_scan = strict_order`);
    const rows = await tx
      .select({ ...hitColumns, distance: distance.mapWith(Number) })
      .from(chunks)
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(and(searchable(orgId), isNotNull(chunks.embedding)))
      .orderBy(distance)
      .limit(clampLimit(limit, 8, 100));
    return rows.map(({ distance: d, ...hit }) => ({ ...hit, score: 1 - d }));
  });
}

export type KeywordSearchOptions = {
  /**
   * "any" (default): OR the terms, ranked by ts_rank, so a natural-language
   * question still matches passages that share only some of its words.
   * "all": websearch semantics as typed (AND, "quoted phrases", -exclusions).
   */
  match?: "any" | "all";
};

/**
 * Full-text search over `chunks.tsv` (headings weighted above body) using
 * `websearch_to_tsquery('english', query)`, ranked by `ts_rank`.
 */
export async function searchByKeywords(
  orgId: string,
  query: string,
  limit = 8,
  options: KeywordSearchOptions = {},
): Promise<ChunkHit[]> {
  const text = query.trim().slice(0, 1000);
  if (!text) return [];
  const websearch = sql`websearch_to_tsquery('english', ${text})`;
  const tsquery =
    options.match === "all" ? websearch : sql`replace(${websearch}::text, ' & ', ' | ')::tsquery`;
  // websearch_to_tsquery(regconfig, text) is immutable, so Postgres folds it once per query.
  const rank = sql<number>`ts_rank(${chunks.tsv}, ${tsquery})`;
  const db = await getDb();
  const rows = await db
    .select({ ...hitColumns, rank: rank.mapWith(Number) })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(searchable(orgId), sql`${chunks.tsv} @@ ${tsquery}`))
    .orderBy(desc(rank), asc(chunks.id))
    .limit(clampLimit(limit, 8, 100));
  return rows.map(({ rank, ...hit }) => ({ ...hit, score: rank }));
}

/** Chunks still missing an embedding (cron retry). Not org-scoped when orgId is null. */
export async function listMissingEmbeddings(orgId: string | null, limit = 100) {
  const db = await getDb();
  const filters = [isNull(chunks.embedding)];
  if (orgId) filters.push(eq(chunks.orgId, orgId));
  return db
    .select({
      id: chunks.id,
      orgId: chunks.orgId,
      documentId: chunks.documentId,
      text: chunks.text,
      headingPath: chunks.headingPath,
    })
    .from(chunks)
    .where(and(...filters))
    .orderBy(asc(chunks.createdAt))
    .limit(clampLimit(limit, 100, 500));
}

export async function setEmbedding(orgId: string, chunkId: string, embedding: number[]): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(chunks)
    .set({ embedding: checkedEmbedding(embedding) })
    .where(and(eq(chunks.id, chunkId), eq(chunks.orgId, orgId)))
    .returning({ id: chunks.id });
  return rows.length > 0;
}
