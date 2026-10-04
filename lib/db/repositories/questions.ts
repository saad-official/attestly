import "server-only";
import { and, asc, count, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb } from "../client";
import { QUESTION_STATUSES, questionnaires, questions } from "../schema";
import type { CitationRef, Question, QuestionStatus } from "../types";
import { refreshCounts } from "./questionnaires";
import { assertQuestionnaireInOrg, clampLimit } from "./shared";

export type NewQuestionInput = {
  /** 1-based worksheet row. */
  rowNumber: number;
  text: string;
  section?: string | null;
  externalId?: string | null;
};

const INSERT_BATCH = 500;

/** Inserts parsed rows as `pending` questions and refreshes the questionnaire counters. */
export async function bulkInsert(orgId: string, questionnaireId: string, rows: NewQuestionInput[]): Promise<number> {
  const db = await getDb();
  await assertQuestionnaireInOrg(db, orgId, questionnaireId);
  const values = rows
    .map((row) => ({
      questionnaireId,
      orgId,
      rowNumber: row.rowNumber,
      text: row.text.trim(),
      section: row.section?.trim() || null,
      externalId: row.externalId?.trim() || null,
    }))
    .filter((row) => row.text.length > 0);
  if (values.length > 0) {
    await db.transaction(async (tx) => {
      for (let i = 0; i < values.length; i += INSERT_BATCH) {
        await tx.insert(questions).values(values.slice(i, i + INSERT_BATCH));
      }
    });
  }
  await refreshCounts(orgId, questionnaireId);
  return values.length;
}

export async function getById(orgId: string, questionId: string): Promise<Question | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

/** In sheet order. */
export async function listForQuestionnaire(
  orgId: string,
  questionnaireId: string,
  options: { status?: QuestionStatus | QuestionStatus[] } = {},
): Promise<Question[]> {
  const db = await getDb();
  const filters = [eq(questions.questionnaireId, questionnaireId), eq(questions.orgId, orgId)];
  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    filters.push(inArray(questions.status, statuses));
  }
  return db
    .select()
    .from(questions)
    .where(and(...filters))
    .orderBy(asc(questions.rowNumber), asc(questions.createdAt));
}

/**
 * The next batch for the drafting agent: `pending` questions in sheet order
 * (spec 3.3 batches of 15). Not a lock: two concurrent drafting requests on
 * the same questionnaire would draft the same rows (harmless but wasteful),
 * so the route should serialise per questionnaire.
 */
export async function nextPending(orgId: string, questionnaireId: string, limit = 15): Promise<Question[]> {
  const db = await getDb();
  return db
    .select()
    .from(questions)
    .where(
      and(eq(questions.questionnaireId, questionnaireId), eq(questions.orgId, orgId), eq(questions.status, "pending")),
    )
    .orderBy(asc(questions.rowNumber), asc(questions.createdAt))
    .limit(clampLimit(limit, 15, 100));
}

export type DraftResult = {
  draft: string;
  status: Extract<QuestionStatus, "drafted" | "needs_evidence" | "not_applicable">;
  confidence?: number | null;
  citations?: CitationRef[];
  retrieval?: Record<string, unknown> | null;
  notes?: string | null;
};

/**
 * Stores the agent's draft. Never overwrites a reviewed (approved) answer.
 * Returns null when the question is not in the org or is already approved.
 * Call `questionnaires.refreshCounts` once after each batch.
 */
export async function updateDraft(orgId: string, questionId: string, result: DraftResult): Promise<Question | null> {
  const db = await getDb();
  const confidence =
    result.confidence === null || result.confidence === undefined
      ? null
      : Math.min(1, Math.max(0, Number(result.confidence) || 0));
  const [row] = await db
    .update(questions)
    .set({
      draft: result.draft,
      status: result.status,
      confidence,
      citations: result.citations ?? [],
      retrieval: result.retrieval ?? null,
      notes: result.notes ?? null,
    })
    .where(and(eq(questions.id, questionId), eq(questions.orgId, orgId), ne(questions.status, "approved")))
    .returning();
  return row ?? null;
}

export type ReviewAction =
  /** Accept the draft, or `final` when the reviewer edited it. */
  | { action: "approve"; final?: string | null }
  | { action: "not_applicable"; final?: string | null; notes?: string | null }
  /** Assign as a task, e.g. "needs a policy for X". */
  | { action: "needs_evidence"; notes?: string | null }
  /** Back to the agent's draft state for another look. */
  | { action: "reopen" };

/**
 * Reviewer decision on one question. Approving sets `final` (edited text or
 * the draft). Refreshes the questionnaire counters. The caller upserts
 * approved answers into the library (`libraryAnswers.upsertFromQuestion`).
 */
export async function review(
  orgId: string,
  questionId: string,
  userId: string,
  decision: ReviewAction,
): Promise<Question | null> {
  const db = await getDb();
  const now = new Date();
  let values: PgUpdateSetSource<typeof questions>;
  switch (decision.action) {
    case "approve": {
      const edited = decision.final?.trim();
      values = {
        status: "approved",
        final: edited ? edited : sql`coalesce(${questions.final}, ${questions.draft}, '')`,
        reviewedBy: userId,
        reviewedAt: now,
      };
      break;
    }
    case "not_applicable":
      values = {
        status: "not_applicable",
        final: decision.final?.trim() || "Not applicable.",
        ...(decision.notes !== undefined ? { notes: decision.notes } : {}),
        reviewedBy: userId,
        reviewedAt: now,
      };
      break;
    case "needs_evidence":
      values = {
        status: "needs_evidence",
        ...(decision.notes !== undefined ? { notes: decision.notes } : {}),
        reviewedBy: userId,
        reviewedAt: now,
      };
      break;
    case "reopen":
      values = {
        status: sql`case when ${questions.draft} is null then 'pending' else 'drafted' end::attestly.question_status`,
        final: null,
        reviewedBy: null,
        reviewedAt: null,
      };
      break;
  }
  const [row] = await db
    .update(questions)
    .set(values)
    .where(and(eq(questions.id, questionId), eq(questions.orgId, orgId)))
    .returning();
  if (row) await refreshCounts(orgId, row.questionnaireId);
  return row ?? null;
}

/**
 * Bulk approve (spec 3.4): every `drafted` question at or above the
 * confidence threshold. Returns the approved rows so the caller can upsert
 * them into the library. Refreshes the counters.
 */
export async function bulkApprove(
  orgId: string,
  questionnaireId: string,
  userId: string,
  minConfidence: number,
): Promise<Question[]> {
  const db = await getDb();
  const rows = await db
    .update(questions)
    .set({
      status: "approved",
      final: sql`coalesce(${questions.final}, ${questions.draft}, '')`,
      reviewedBy: userId,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(questions.questionnaireId, questionnaireId),
        eq(questions.orgId, orgId),
        eq(questions.status, "drafted"),
        gte(questions.confidence, minConfidence),
      ),
    )
    .returning();
  await refreshCounts(orgId, questionnaireId);
  return rows;
}

export type QuestionCounts = Record<QuestionStatus, number> & { total: number };

/** Exact per-status counts for one questionnaire. */
export async function counts(orgId: string, questionnaireId: string): Promise<QuestionCounts> {
  const db = await getDb();
  const rows = await db
    .select({ status: questions.status, n: count() })
    .from(questions)
    .where(and(eq(questions.questionnaireId, questionnaireId), eq(questions.orgId, orgId)))
    .groupBy(questions.status);
  const result = Object.fromEntries(QUESTION_STATUSES.map((s) => [s, 0])) as QuestionCounts;
  result.total = 0;
  for (const row of rows) {
    result[row.status] = row.n;
    result.total += row.n;
  }
  return result;
}

/**
 * Sidebar badge: questions that need evidence across questionnaires in
 * review (the owner's open tasks).
 */
export async function getOpenCount(orgId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(questions)
    .innerJoin(questionnaires, eq(questionnaires.id, questions.questionnaireId))
    .where(
      and(
        eq(questions.orgId, orgId),
        eq(questions.status, "needs_evidence"),
        eq(questionnaires.orgId, orgId),
        eq(questionnaires.status, "review"),
      ),
    );
  return row?.n ?? 0;
}

/** `needs_evidence` questions across the org (knowledge-gap clustering on the dashboard). */
export async function listNeedsEvidence(orgId: string, limit = 200) {
  const db = await getDb();
  return db
    .select({
      id: questions.id,
      questionnaireId: questions.questionnaireId,
      questionnaireName: questionnaires.name,
      text: questions.text,
      notes: questions.notes,
    })
    .from(questions)
    .innerJoin(questionnaires, eq(questionnaires.id, questions.questionnaireId))
    .where(and(eq(questions.orgId, orgId), eq(questions.status, "needs_evidence")))
    .orderBy(asc(questions.createdAt))
    .limit(clampLimit(limit, 200, 1000));
}

/** Approved answers across the org (hours-saved estimate: approved x 4 minutes). */
export async function countApproved(orgId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(questions)
    .where(and(eq(questions.orgId, orgId), eq(questions.status, "approved")));
  return row?.n ?? 0;
}
