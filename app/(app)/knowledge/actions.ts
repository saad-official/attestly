"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult, FormActionState } from "@/components/dashboard/action-result";
import { requireOrgContext } from "@/lib/auth/session";
import { deleteDocument, pasteDocument, reindexDocument } from "@/lib/services/knowledge";
import { actionError, formText, uuidSchema } from "../_lib/action-errors";

/*
 * Knowledge-base Server Actions. Each calls requireOrgContext() first and
 * passes ctx.org.id to the knowledge service, which scopes every query to
 * the organisation. File uploads go through POST /api/documents instead
 * (Server Action bodies are capped at 1 MB); pasted text is small enough.
 */

function revalidateKnowledge(documentId?: string) {
  revalidatePath("/knowledge");
  revalidatePath("/dashboard");
  if (documentId) revalidatePath(`/knowledge/${documentId}`);
}

/** "Paste text" dialog: indexes pasted Markdown or plain text as a `pasted` document. */
export async function pasteDocumentAction(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
  const ctx = await requireOrgContext();
  const title = formText(formData, "title");
  const text = typeof formData.get("text") === "string" ? String(formData.get("text")) : "";
  if (!title) return { ok: false, error: "Give the document a title." };
  if (!text.trim()) return { ok: false, error: "Paste some text to index." };
  try {
    const doc = await pasteDocument(ctx.org.id, { title, text });
    revalidateKnowledge(doc.id);
    if (doc.status === "failed") return { ok: false, error: doc.error ?? "The text could not be indexed." };
    return {
      ok: true,
      message: `${doc.title} indexed into ${doc.chunkCount} ${doc.chunkCount === 1 ? "chunk" : "chunks"}.`,
    };
  } catch (error) {
    return actionError(error, "paste document");
  }
}

/**
 * Re-index: the service builds a new version (new id) and supersedes the old
 * one, so old citations still resolve. Returns the new id.
 */
export async function reindexDocumentAction(documentId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  const id = uuidSchema.safeParse(documentId);
  if (!id.success) return { ok: false, error: "Unknown document." };
  try {
    const doc = await reindexDocument(ctx.org.id, id.data);
    revalidateKnowledge(id.data);
    revalidateKnowledge(doc.id);
    return {
      ok: true,
      message: `Re-indexed into ${doc.chunkCount} ${doc.chunkCount === 1 ? "chunk" : "chunks"}.`,
      data: { id: doc.id },
    };
  } catch (error) {
    return actionError(error, "reindex document");
  }
}

export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const id = uuidSchema.safeParse(documentId);
  if (!id.success) return { ok: false, error: "Unknown document." };
  try {
    const removed = await deleteDocument(ctx.org.id, id.data);
    revalidateKnowledge(id.data);
    if (!removed) return { ok: false, error: "That document was already deleted." };
    return { ok: true, message: "Document deleted." };
  } catch (error) {
    return actionError(error, "delete document");
  }
}
