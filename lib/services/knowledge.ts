import "server-only";
import * as chunksRepo from "@/lib/db/repositories/chunks";
import * as documentsRepo from "@/lib/db/repositories/documents";
import * as libraryRepo from "@/lib/db/repositories/libraryAnswers";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import type { DocumentKind, DocumentSummary, Organization } from "@/lib/db/types";
import { chunkDocument, countWords } from "@/lib/ingest/chunk";
import { DocumentExtractionError, MAX_DOCUMENT_BYTES, extractText } from "@/lib/ingest/extract";
import { NotFoundError, ServiceError, errorMessage, isUuid } from "./errors";
import { PlanLimitError, limitsFor, pagesForText } from "./plan-limits";
import {
  audit,
  chunkEmbeddingText,
  documentEmbedder,
  embedInBatches,
  isDemoDocument,
  type ServiceDeps,
} from "./shared";

/**
 * Knowledge base (spec 3.1): upload or paste policies, extract, chunk, embed,
 * index; re-index (the old version is kept, superseded, so old citations
 * still resolve); delete; list; stats. Free plan: 25 pages (500 words each).
 */

export type KnowledgeDeps = ServiceDeps & {
  /** Demo seeding: do not check the Free page quota. */
  skipPlanLimits?: boolean;
};

export type UploadDocumentInput = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  /** Defaults to the file name without its extension. */
  title?: string;
  kind: DocumentKind;
};

export type PasteDocumentInput = {
  title: string;
  text: string;
  /** Default "pasted". */
  kind?: DocumentKind;
  /** Optional, e.g. "access-control-policy.md" for the demo. */
  fileName?: string | null;
};

const EMBED_BATCH = 32;

// ---------------------------------------------------------------------------
// Plan gate

export type PageUsage = { used: number; limit: number | null };

/** Pages used by current (non-superseded, not failed) documents, excluding the demo workspace. */
export async function pageUsage(org: Pick<Organization, "id" | "plan">): Promise<PageUsage> {
  const docs = await documentsRepo.listForOrg(org.id, { limit: 500 });
  const used = docs
    .filter((d) => d.status !== "failed" && !isDemoDocument(d))
    .reduce((sum, d) => sum + pagesForText(d.text), 0);
  return { used, limit: limitsFor(org.plan).pages };
}

/**
 * Free-plan gate: throws PlanLimitError when `incomingPages` more pages would
 * exceed the plan's knowledge-base size (25 pages on Free; Pro is unlimited).
 */
export async function assertPageQuota(org: Pick<Organization, "id" | "plan">, incomingPages: number): Promise<void> {
  const limit = limitsFor(org.plan).pages;
  if (limit === null) return;
  const { used } = await pageUsage(org);
  if (used + incomingPages <= limit) return;
  throw new PlanLimitError(
    "pages",
    `The Free plan includes ${limit} pages of policies (500 words a page). This document adds ${incomingPages} ${
      incomingPages === 1 ? "page" : "pages"
    } to the ${used} already used. Upgrade to Pro for unlimited pages.`,
    { limit, used },
  );
}

async function requireOrg(orgId: string): Promise<Organization> {
  const org = await organizationsRepo.getById(orgId);
  if (!org) throw new NotFoundError("Organization");
  return org;
}

// ---------------------------------------------------------------------------
// Indexing

type IndexOutcome = { chunkCount: number; embedded: number; embeddingError: string | null };

/** Chunks, embeds (in batches) and stores the chunks of an existing document row; marks it ready or failed. */
async function indexDocument(
  orgId: string,
  doc: DocumentSummary,
  text: string,
  deps: ServiceDeps | undefined,
  context: { pages: number; source: "upload" | "paste" | "reindex" },
): Promise<DocumentSummary> {
  const started = Date.now();
  let outcome: IndexOutcome;
  try {
    const pieces = chunkDocument(text);
    if (pieces.length === 0) throw new ServiceError("invalid_input", "The document contains no text to index.");

    // Embeddings failing (quota, outage) must not lose the upload: chunks are
    // stored without vectors, keyword search still finds them, and the daily
    // cron fills the vectors in.
    let vectors: Array<number[] | null> = pieces.map(() => null);
    let embeddingError: string | null = null;
    try {
      vectors = await embedInBatches(
        documentEmbedder(deps),
        pieces.map((p) => chunkEmbeddingText(p.headingPath, p.text)),
        EMBED_BATCH,
      );
    } catch (error) {
      embeddingError = errorMessage(error);
      console.warn(`[knowledge] embedding failed for document ${doc.id}; stored without vectors:`, embeddingError);
    }

    const chunkCount = await chunksRepo.bulkInsert(
      orgId,
      doc.id,
      pieces.map((p, i) => ({
        position: p.position,
        headingPath: p.headingPath,
        text: p.text,
        tokenCount: p.tokenCount,
        embedding: vectors[i],
      })),
    );
    outcome = { chunkCount, embedded: embeddingError ? 0 : chunkCount, embeddingError };
  } catch (error) {
    const message = error instanceof ServiceError ? error.message : `Indexing failed: ${errorMessage(error)}`;
    const failed = await documentsRepo.markFailed(orgId, doc.id, message);
    await audit({
      orgId,
      actor: "system",
      type: "document.index_failed",
      entityType: "document",
      entityId: doc.id,
      output: { error: message, source: context.source },
    });
    return failed ?? { ...doc, status: "failed", error: message };
  }

  const ready = await documentsRepo.update(orgId, doc.id, {
    status: "ready",
    chunkCount: outcome.chunkCount,
    error: outcome.embeddingError
      ? "Semantic search is pending for this document (embedding failed); keyword search works and the daily job retries."
      : null,
  });
  await audit({
    orgId,
    actor: "system",
    type: "document.indexed",
    entityType: "document",
    entityId: doc.id,
    input: { title: doc.title, kind: doc.kind, source: context.source, words: countWords(text), pages: context.pages },
    output: {
      chunks: outcome.chunkCount,
      embedded: outcome.embedded,
      embeddingError: outcome.embeddingError,
      latencyMs: Date.now() - started,
    },
  });
  return ready ?? doc;
}

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "");
  return base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled document";
}

/**
 * Upload (spec 3.1): PDF, DOCX, Markdown or TXT up to 10 MB. Extracts the
 * text, checks the Free page quota, stores the original bytes, then chunks,
 * embeds and indexes. Returns the document row: status "ready", or "failed"
 * with `error` when the file could not be read or indexed.
 *
 * Throws ServiceError for empty, unsupported or oversized files (no row is
 * created) and PlanLimitError when the Free page quota would be exceeded.
 */
export async function uploadDocument(
  orgId: string,
  input: UploadDocumentInput,
  deps?: KnowledgeDeps,
): Promise<DocumentSummary> {
  const org = await requireOrg(orgId);
  const fileName = input.fileName.trim() || "document";
  if (input.bytes.byteLength === 0) throw new ServiceError("invalid_input", `${fileName} is empty.`);
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new ServiceError("too_large", `${fileName} is larger than 10 MB.`);
  }
  const title = input.title?.trim() || titleFromFileName(fileName);
  const original = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  const failedRow = async (message: string) => {
    const doc = await documentsRepo.create(orgId, {
      title,
      kind: input.kind,
      fileName,
      mimeType: input.mimeType,
      original,
      status: "failed",
    });
    return (await documentsRepo.markFailed(orgId, doc.id, message)) ?? doc;
  };

  let text: string;
  let warnings: string[] = [];
  try {
    const extracted = await extractText({ bytes: input.bytes, mimeType: input.mimeType, fileName });
    text = extracted.text;
    warnings = extracted.warnings;
  } catch (error) {
    if (error instanceof DocumentExtractionError && error.code !== "parse_failed") {
      throw new ServiceError(error.code === "too_large" ? "too_large" : "unsupported_file", error.message, {
        cause: error,
      });
    }
    // Unreadable file: keep a failed row so the user sees what happened.
    return failedRow(errorMessage(error));
  }
  if (text.trim().length === 0) return failedRow(warnings[0] ?? "The document contains no extractable text.");

  const pages = pagesForText(text);
  if (!deps?.skipPlanLimits) await assertPageQuota(org, pages);

  const doc = await documentsRepo.create(orgId, {
    title,
    kind: input.kind,
    fileName,
    mimeType: input.mimeType,
    original,
    text,
    status: "indexing",
  });
  return indexDocument(orgId, doc, text, deps, { pages, source: "upload" });
}

/** Pasted text (Markdown headings are honoured by the chunker). Same quota and indexing as uploads. */
export async function pasteDocument(
  orgId: string,
  input: PasteDocumentInput,
  deps?: KnowledgeDeps,
): Promise<DocumentSummary> {
  const title = input.title.trim();
  if (!title) throw new ServiceError("invalid_input", "Give the document a title.");
  const text = input.text.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new ServiceError("invalid_input", "Paste some text to index.");
  if (Buffer.byteLength(text, "utf8") > MAX_DOCUMENT_BYTES) {
    throw new ServiceError("too_large", "Pasted text is larger than 10 MB.");
  }
  const pages = pagesForText(text);
  if (!deps?.skipPlanLimits) await assertPageQuota(await requireOrg(orgId), pages);

  const doc = await documentsRepo.create(orgId, {
    title,
    kind: input.kind ?? "pasted",
    fileName: input.fileName ?? null,
    mimeType: "text/markdown",
    text,
    status: "indexing",
  });
  return indexDocument(orgId, doc, text, deps, { pages, source: "paste" });
}

/**
 * Re-index (spec 3.1): builds a new document row from the stored original
 * (re-extracted) or, for pasted text, the stored text, indexes it, and only
 * then marks the old row superseded. Old chunks stay so citations in earlier
 * answers still resolve. If the new version fails to index, it is removed,
 * the old version stays current and a ServiceError is thrown. Returns the new
 * document (a new id).
 */
export async function reindexDocument(orgId: string, documentId: string, deps?: ServiceDeps): Promise<DocumentSummary> {
  if (!isUuid(documentId)) throw new NotFoundError("Document");
  const old = await documentsRepo.getById(orgId, documentId);
  if (!old) throw new NotFoundError("Document");
  if (old.supersededAt) throw new ServiceError("conflict", "This version was already replaced by a newer one.");

  const stored = await documentsRepo.getOriginal(orgId, documentId);
  let text = old.text;
  if (stored) {
    try {
      text = (
        await extractText({
          bytes: stored.original,
          mimeType: stored.mimeType ?? "",
          fileName: stored.fileName ?? old.fileName ?? "document",
        })
      ).text;
    } catch (error) {
      if (!text.trim()) throw new ServiceError("invalid_input", `Could not re-read the file: ${errorMessage(error)}`);
    }
  }
  if (!text.trim()) throw new ServiceError("invalid_input", "The document has no text to index.");

  const next = await documentsRepo.create(orgId, {
    title: old.title,
    kind: old.kind,
    fileName: old.fileName,
    mimeType: old.mimeType,
    sizeBytes: old.sizeBytes,
    original: stored?.original ?? null,
    text,
    status: "indexing",
  });
  const indexed = await indexDocument(orgId, next, text, deps, { pages: pagesForText(text), source: "reindex" });
  if (indexed.status !== "ready") {
    await documentsRepo.remove(orgId, next.id);
    throw new ServiceError("invalid_input", indexed.error ?? "Re-indexing failed; the previous version is still in use.");
  }
  await documentsRepo.markSuperseded(orgId, old.id);
  await audit({
    orgId,
    actor: "user",
    type: "document.reindexed",
    entityType: "document",
    entityId: indexed.id,
    input: { previousId: old.id },
    output: { chunks: indexed.chunkCount },
  });
  return indexed;
}

/**
 * Deletes a document and its chunks. Returns false when it is not in the org.
 * Citations to it in old answers then resolve to nothing (the detail view
 * shows them as "source removed").
 */
export async function deleteDocument(orgId: string, documentId: string): Promise<boolean> {
  if (!isUuid(documentId)) return false;
  const removed = await documentsRepo.remove(orgId, documentId);
  if (removed) {
    await audit({ orgId, actor: "user", type: "document.deleted", entityType: "document", entityId: documentId });
  }
  return removed;
}

export type DocumentListItem = Omit<DocumentSummary, "text"> & {
  words: number;
  pages: number;
  /** First ~240 characters of the text, for the list. */
  excerpt: string;
  /** Part of the synthetic demo workspace (exempt from the Free page quota). */
  isDemo: boolean;
};

/** Current documents (superseded versions hidden), newest first, without the full text. */
export async function listDocuments(orgId: string): Promise<DocumentListItem[]> {
  const docs = await documentsRepo.listForOrg(orgId, { limit: 500 });
  return docs.map(({ text, ...rest }) => ({
    ...rest,
    words: countWords(text),
    pages: pagesForText(text),
    excerpt: text
      .replace(/^#+\s+/gm, "")
      .replace(/^>\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240),
    isDemo: isDemoDocument({ title: rest.title, text }),
  }));
}

export type KnowledgeStats = {
  documents: number;
  chunks: number;
  /** Documents still indexing. */
  indexing: number;
  failed: number;
  /** Pages counted against the plan (demo documents excluded). */
  pagesUsed: number;
  /** null = unlimited (Pro). */
  pageLimit: number | null;
  libraryAnswers: number;
};

export async function knowledgeStats(orgId: string): Promise<KnowledgeStats> {
  const org = await requireOrg(orgId);
  const [stats, failed, libraryAnswers, usage] = await Promise.all([
    documentsRepo.statsForOrg(orgId),
    documentsRepo.listForOrg(orgId, { status: "failed", limit: 500 }),
    libraryRepo.countForOrg(orgId),
    pageUsage(org),
  ]);
  return {
    documents: stats.documents,
    chunks: stats.chunks,
    indexing: stats.pending,
    failed: failed.length,
    pagesUsed: usage.used,
    pageLimit: usage.limit,
    libraryAnswers,
  };
}
