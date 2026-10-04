"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult, FormActionState } from "@/components/dashboard/action-result";
import { requireOrgContext } from "@/lib/auth/session";
import { DEFAULT_SHARE_DAYS } from "@/lib/services/plan-limits";
import {
  bulkApprove,
  confirmMapping,
  createShareLink,
  deleteQuestionnaire,
  revokeShareLink,
  reviewQuestion,
  type ReviewAction,
} from "@/lib/services/questionnaires";
import { actionError, formText, optionalColumn, uuidSchema } from "../_lib/action-errors";

/*
 * Questionnaire Server Actions (spec 3.2 to 3.5). Each calls
 * requireOrgContext() first and passes ctx.org.id (and ctx.user.id as the
 * reviewer) to the questionnaires service, which scopes everything to the
 * organisation. Uploads go through POST /api/questionnaires and drafting
 * through POST /api/questionnaires/[id]/draft (long-running, polled).
 */

function revalidateQuestionnaire(questionnaireId: string) {
  revalidatePath(`/questionnaires/${questionnaireId}`);
  revalidatePath("/questionnaires");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Mapping

/** "Confirm and start drafting": stores the mapping, inserts the questions, then opens the review page. */
export async function confirmMappingAction(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
  const ctx = await requireOrgContext();
  const id = uuidSchema.safeParse(formText(formData, "questionnaireId"));
  if (!id.success) return { ok: false, error: "Unknown questionnaire." };
  const question = optionalColumn(formText(formData, "question"));
  if (question === undefined) return { ok: false, error: "Choose the column that holds the questions." };
  const headerRow = Number(formText(formData, "headerRow"));
  if (!Number.isInteger(headerRow) || headerRow < 0) return { ok: false, error: "Choose a valid header row." };
  const sheetName = formText(formData, "sheetName");

  try {
    await confirmMapping(ctx.org.id, id.data, {
      ...(sheetName ? { sheetName } : {}),
      headerRow,
      columns: {
        question,
        answer: optionalColumn(formText(formData, "answer")),
        comment: optionalColumn(formText(formData, "comment")),
        id: optionalColumn(formText(formData, "id")),
      },
    });
  } catch (error) {
    return actionError(error, "confirm mapping");
  }
  revalidateQuestionnaire(id.data);
  revalidatePath(`/questionnaires/${id.data}/mapping`);
  redirect(`/questionnaires/${id.data}`);
}

export async function deleteQuestionnaireAction(questionnaireId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const id = uuidSchema.safeParse(questionnaireId);
  if (!id.success) return { ok: false, error: "Unknown questionnaire." };
  try {
    const removed = await deleteQuestionnaire(ctx.org.id, id.data);
    if (!removed) return { ok: false, error: "That questionnaire was already deleted." };
  } catch (error) {
    return actionError(error, "delete questionnaire");
  }
  revalidatePath("/questionnaires");
  revalidatePath("/dashboard");
  revalidatePath("/library");
  redirect("/questionnaires");
}

// ---------------------------------------------------------------------------
// Review (spec 3.4)

const REVIEW_ACTIONS = ["approve", "edit", "not_applicable", "needs_evidence", "reopen"] as const satisfies readonly ReviewAction[];

const reviewSchema = z.object({
  action: z.enum(REVIEW_ACTIONS),
  final: z.string().max(8000, { error: "Answers are limited to 8,000 characters." }).nullish(),
  notes: z.string().max(2000, { error: "Notes are limited to 2,000 characters." }).nullish(),
});

export type ReviewActionInput = z.input<typeof reviewSchema>;

/**
 * One reviewer decision. Approving (or editing) upserts the answer into the
 * library in the service. The reviewer is the signed-in user.
 */
export async function reviewQuestionAction(questionId: string, input: ReviewActionInput): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const id = uuidSchema.safeParse(questionId);
  if (!id.success) return { ok: false, error: "Unknown question." };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid review." };
  try {
    const result = await reviewQuestion(
      ctx.org.id,
      id.data,
      {
        action: parsed.data.action,
        ...(parsed.data.final !== undefined ? { final: parsed.data.final } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      },
      ctx.user.id,
    );
    revalidateQuestionnaire(result.question.questionnaireId);
    revalidatePath("/library");
    return { ok: true };
  } catch (error) {
    return actionError(error, "review question");
  }
}

/** Approves every drafted question at or above the threshold (0..1). */
export async function bulkApproveAction(questionnaireId: string, minConfidence: number): Promise<ActionResult<{ approved: number }>> {
  const ctx = await requireOrgContext();
  const id = uuidSchema.safeParse(questionnaireId);
  if (!id.success) return { ok: false, error: "Unknown questionnaire." };
  if (typeof minConfidence !== "number" || !Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    return { ok: false, error: "The confidence threshold must be between 0 and 1." };
  }
  try {
    const result = await bulkApprove(ctx.org.id, id.data, minConfidence, ctx.user.id);
    revalidateQuestionnaire(id.data);
    revalidatePath("/library");
    return {
      ok: true,
      message:
        result.approved === 0
          ? "No drafted answers met the threshold."
          : `${result.approved} ${result.approved === 1 ? "answer" : "answers"} approved and added to the library.`,
      data: { approved: result.approved },
    };
  } catch (error) {
    return actionError(error, "bulk approve");
  }
}

// ---------------------------------------------------------------------------
// Share links (Pro)

export async function createShareLinkAction(
  questionnaireId: string,
  days: number = DEFAULT_SHARE_DAYS,
): Promise<ActionResult<{ path: string }>> {
  const ctx = await requireOrgContext();
  const id = uuidSchema.safeParse(questionnaireId);
  if (!id.success) return { ok: false, error: "Unknown questionnaire." };
  const ttl = Number.isInteger(days) && days >= 1 && days <= 365 ? days : DEFAULT_SHARE_DAYS;
  try {
    const link = await createShareLink(ctx.org.id, id.data, ttl);
    revalidatePath(`/questionnaires/${id.data}`);
    return { ok: true, message: "Share link created.", data: { path: link.path } };
  } catch (error) {
    return actionError(error, "create share link");
  }
}

export async function revokeShareLinkAction(questionnaireId: string, shareLinkId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const qid = uuidSchema.safeParse(questionnaireId);
  const lid = uuidSchema.safeParse(shareLinkId);
  if (!qid.success || !lid.success) return { ok: false, error: "Unknown share link." };
  try {
    const revoked = await revokeShareLink(ctx.org.id, lid.data);
    revalidatePath(`/questionnaires/${qid.data}`);
    if (!revoked) return { ok: false, error: "That link was already revoked." };
    return { ok: true, message: "Share link revoked." };
  } catch (error) {
    return actionError(error, "revoke share link");
  }
}
