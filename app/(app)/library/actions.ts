"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult, FormActionState } from "@/components/dashboard/action-result";
import { requireOrgContext } from "@/lib/auth/session";
import { addLibraryAnswer, deleteLibraryAnswer, exportLibraryCsv } from "@/lib/services/library";
import { actionError, formText, uuidSchema } from "../_lib/action-errors";

/*
 * Answer-library Server Actions. Each calls requireOrgContext() first and
 * passes ctx.org.id to the library service. Workbook imports go through
 * POST /api/library/import (file bodies can exceed the 1 MB action cap).
 */

function revalidateLibrary() {
  revalidatePath("/library");
  revalidatePath("/dashboard");
}

export async function addLibraryAnswerAction(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
  const ctx = await requireOrgContext();
  const question = formText(formData, "question");
  const answer = formText(formData, "answer");
  if (!question || !answer) return { ok: false, error: "Both a question and an answer are needed." };
  try {
    await addLibraryAnswer(ctx.org.id, { question, answer });
    revalidateLibrary();
    return { ok: true, message: "Answer added to the library." };
  } catch (error) {
    return actionError(error, "add library answer");
  }
}

export async function deleteLibraryAnswerAction(id: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Unknown library answer." };
  try {
    const removed = await deleteLibraryAnswer(ctx.org.id, parsed.data);
    revalidateLibrary();
    if (!removed) return { ok: false, error: "That answer was already deleted." };
    return { ok: true, message: "Answer removed from the library." };
  } catch (error) {
    return actionError(error, "delete library answer");
  }
}

/**
 * Library export (Pro). There is no export route, so the action returns the
 * CSV text and the browser saves it. PlanLimitError on Free comes back as
 * `{ error, upgradeUrl }`. Read-only: nothing to revalidate.
 */
export async function exportLibraryAction(): Promise<ActionResult<{ csv: string; fileName: string }>> {
  const ctx = await requireOrgContext();
  try {
    const csv = await exportLibraryCsv(ctx.org.id);
    const stamp = new Date().toISOString().slice(0, 10);
    return { ok: true, data: { csv, fileName: `attestly-answer-library-${stamp}.csv` } };
  } catch (error) {
    return actionError(error, "export library");
  }
}
