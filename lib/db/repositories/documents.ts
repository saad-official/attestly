import "server-only";
import { and, count, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { getDb } from "../client";
import { chunks, documents } from "../schema";
import type { DocumentKind, DocumentStatus, DocumentSummary } from "../types";
import { clampLimit } from "./shared";

/** Every column except `original` (the uploaded bytes): list and detail queries never ship the file. */
const { original: _original, ...summaryColumns } = getTableColumns(documents);
void _original;

export type CreateDocumentInput = {
  title: string;
  kind?: DocumentKind;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  original?: Buffer | null;
  /** Extracted text; may be filled later with `update`. */
  text?: string;
  status?: DocumentStatus;
};

export async function create(orgId: string, input: CreateDocumentInput): Promise<DocumentSummary> {
  const title = input.title.trim();
  if (!title) throw new Error("Document title cannot be empty.");
  const db = await getDb();
  const [row] = await db
    .insert(documents)
    .values({
      orgId,
      title: title.slice(0, 300),
      kind: input.kind ?? "policy",
      fileName: input.fileName ?? null,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? input.original?.byteLength ?? null,
      original: input.original ?? null,
      text: input.text ?? "",
      status: input.status ?? "indexing",
    })
    .returning(summaryColumns);
  return row;
}

export async function getById(orgId: string, documentId: string): Promise<DocumentSummary | null> {
  const db = await getDb();
  const [row] = await db
    .select(summaryColumns)
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

/** The uploaded file, or null when there is none (pasted text) or the document is not in the org. */
export async function getOriginal(
  orgId: string,
  documentId: string,
): Promise<{ original: Buffer; fileName: string | null; mimeType: string | null } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ original: documents.original, fileName: documents.fileName, mimeType: documents.mimeType })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)))
    .limit(1);
  if (!row?.original) return null;
  return { original: row.original, fileName: row.fileName, mimeType: row.mimeType };
}

export type ListDocumentsOptions = {
  kind?: DocumentKind;
  status?: DocumentStatus;
  /** Superseded (re-indexed) versions are hidden unless this is true. */
  includeSuperseded?: boolean;
  limit?: number;
};

/** Newest first, without `original`. Text is included (callers that only list titles can ignore it). */
export async function listForOrg(orgId: string, options: ListDocumentsOptions = {}): Promise<DocumentSummary[]> {
  const db = await getDb();
  const filters = [eq(documents.orgId, orgId)];
  if (options.kind) filters.push(eq(documents.kind, options.kind));
  if (options.status) filters.push(eq(documents.status, options.status));
  if (!options.includeSuperseded) filters.push(isNull(documents.supersededAt));
  return db
    .select(summaryColumns)
    .from(documents)
    .where(and(...filters))
    .orderBy(desc(documents.createdAt))
    .limit(clampLimit(options.limit, 100, 500));
}

export type DocumentPatch = {
  title?: string;
  text?: string;
  status?: DocumentStatus;
  chunkCount?: number;
  /** Pass null to clear. */
  error?: string | null;
};

/** Updates status / text / chunkCount / error (and title). Returns null when not in the org. */
export async function update(orgId: string, documentId: string, patch: DocumentPatch): Promise<DocumentSummary | null> {
  const values: Partial<typeof documents.$inferInsert> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("Document title cannot be empty.");
    values.title = title.slice(0, 300);
  }
  if (patch.text !== undefined) values.text = patch.text;
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.chunkCount !== undefined) values.chunkCount = Math.max(0, Math.floor(patch.chunkCount));
  if (patch.error !== undefined) values.error = patch.error === null ? null : patch.error.slice(0, 2000);
  if (Object.keys(values).length === 0) return getById(orgId, documentId);
  const db = await getDb();
  const [row] = await db
    .update(documents)
    .set(values)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)))
    .returning(summaryColumns);
  return row ?? null;
}

export function markReady(orgId: string, documentId: string, chunkCount: number) {
  return update(orgId, documentId, { status: "ready", chunkCount, error: null });
}

export function markFailed(orgId: string, documentId: string, error: string) {
  return update(orgId, documentId, { status: "failed", error });
}

/**
 * Re-index: marks the old version superseded. Its chunks stay so citations
 * in old answers still resolve, but search skips them.
 */
export async function markSuperseded(orgId: string, documentId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(documents)
    .set({ supersededAt: new Date() })
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId), isNull(documents.supersededAt)))
    .returning({ id: documents.id });
  return rows.length > 0;
}

/** Deletes the document and (by cascade) its chunks. Returns false when not in the org. */
export async function remove(orgId: string, documentId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)))
    .returning({ id: documents.id });
  return rows.length > 0;
}
export { remove as delete };

/** Knowledge-base size for the dashboard and plan limits (current, non-superseded versions). */
export async function statsForOrg(orgId: string): Promise<{ documents: number; chunks: number; pending: number }> {
  const db = await getDb();
  const [docs] = await db
    .select({
      documents: count(),
      pending: sql<number>`count(*) filter (where ${documents.status} = 'indexing')`.mapWith(Number),
    })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), isNull(documents.supersededAt)));
  const [chunkRow] = await db
    .select({ chunks: count() })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(eq(chunks.orgId, orgId), isNull(documents.supersededAt)));
  return { documents: docs?.documents ?? 0, chunks: chunkRow?.chunks ?? 0, pending: docs?.pending ?? 0 };
}
