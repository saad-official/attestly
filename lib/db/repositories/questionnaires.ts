import "server-only";
import { and, count, desc, eq, getTableColumns, gte, sql } from "drizzle-orm";
import { getDb } from "../client";
import { questionnaires, questions } from "../schema";
import type { QuestionnaireStatus, QuestionnaireSummary } from "../types";
import { clampLimit, isUniqueViolation, randomUrlSafeId } from "./shared";

/** Every column except `original` (the workbook bytes). */
const { original: _original, ...summaryColumns } = getTableColumns(questionnaires);
void _original;

export type CreateQuestionnaireInput = {
  name: string;
  customer?: string | null;
  fileName: string;
  mimeType: string;
  original: Buffer;
  sheetName?: string | null;
};

export async function create(orgId: string, input: CreateQuestionnaireInput): Promise<QuestionnaireSummary> {
  const name = input.name.trim();
  if (!name) throw new Error("Questionnaire name cannot be empty.");
  const db = await getDb();
  const [row] = await db
    .insert(questionnaires)
    .values({
      orgId,
      name: name.slice(0, 200),
      customer: input.customer?.trim() || null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      original: input.original,
      sheetName: input.sheetName ?? null,
    })
    .returning(summaryColumns);
  return row;
}

export async function getById(orgId: string, questionnaireId: string): Promise<QuestionnaireSummary | null> {
  const db = await getDb();
  const [row] = await db
    .select(summaryColumns)
    .from(questionnaires)
    .where(and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

/** The customer's original file, for mapping detection and XLSX write-back. */
export async function getOriginal(
  orgId: string,
  questionnaireId: string,
): Promise<{ original: Buffer; fileName: string; mimeType: string; sheetName: string | null } | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      original: questionnaires.original,
      fileName: questionnaires.fileName,
      mimeType: questionnaires.mimeType,
      sheetName: questionnaires.sheetName,
    })
    .from(questionnaires)
    .where(and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function listForOrg(
  orgId: string,
  options: { status?: QuestionnaireStatus; limit?: number } = {},
): Promise<QuestionnaireSummary[]> {
  const db = await getDb();
  const filters = [eq(questionnaires.orgId, orgId)];
  if (options.status) filters.push(eq(questionnaires.status, options.status));
  return db
    .select(summaryColumns)
    .from(questionnaires)
    .where(and(...filters))
    .orderBy(desc(questionnaires.createdAt))
    .limit(clampLimit(options.limit, 50, 200));
}

/** Free-plan limit (1 a month): questionnaires created since `since`. */
export async function countCreatedSince(orgId: string, since: Date): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(questionnaires)
    .where(and(eq(questionnaires.orgId, orgId), gte(questionnaires.createdAt, since)));
  return row?.n ?? 0;
}

export type QuestionnaireMapping = {
  /** null for CSV. */
  sheetName: string | null;
  /** 1-based row/column numbers (ExcelJS convention). */
  headerRow: number;
  questionCol: number;
  answerCol: number;
  idCol?: number | null;
  commentCol?: number | null;
};

function positive(name: string, value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive 1-based integer.`);
  return value;
}

export async function updateMapping(
  orgId: string,
  questionnaireId: string,
  mapping: QuestionnaireMapping,
): Promise<QuestionnaireSummary | null> {
  const db = await getDb();
  const [row] = await db
    .update(questionnaires)
    .set({
      sheetName: mapping.sheetName,
      headerRow: positive("headerRow", mapping.headerRow),
      questionCol: positive("questionCol", mapping.questionCol),
      answerCol: positive("answerCol", mapping.answerCol),
      idCol: positive("idCol", mapping.idCol),
      commentCol: positive("commentCol", mapping.commentCol),
    })
    .where(and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId)))
    .returning(summaryColumns);
  return row ?? null;
}

export async function updateStatus(
  orgId: string,
  questionnaireId: string,
  status: QuestionnaireStatus,
): Promise<QuestionnaireSummary | null> {
  const db = await getDb();
  const [row] = await db
    .update(questionnaires)
    .set({ status })
    .where(and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId)))
    .returning(summaryColumns);
  return row ?? null;
}

/**
 * Recomputes the denormalised counters from `questions` in one statement:
 * question_count (all), drafted_count (processed by the agent, i.e. status
 * is not 'pending'; drafting is complete when it equals question_count),
 * approved_count and needs_evidence_count. Call after any question write.
 */
export async function refreshCounts(orgId: string, questionnaireId: string): Promise<QuestionnaireSummary | null> {
  const db = await getDb();
  const q = questions;
  const [row] = await db
    .update(questionnaires)
    .set({
      questionCount: sql`(select count(*) from ${q} where ${q.questionnaireId} = ${questionnaireId})`,
      draftedCount: sql`(select count(*) from ${q} where ${q.questionnaireId} = ${questionnaireId} and ${q.status} <> 'pending')`,
      approvedCount: sql`(select count(*) from ${q} where ${q.questionnaireId} = ${questionnaireId} and ${q.status} = 'approved')`,
      needsEvidenceCount: sql`(select count(*) from ${q} where ${q.questionnaireId} = ${questionnaireId} and ${q.status} = 'needs_evidence')`,
    })
    .where(and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId)))
    .returning(summaryColumns);
  return row ?? null;
}
export { refreshCounts as updateCounts };

/**
 * Sets the read-only share id. `undefined` generates a fresh unguessable id
 * (16 url-safe characters, 96 bits), `null` unshares. Returns the new id.
 */
export async function setPublicId(
  orgId: string,
  questionnaireId: string,
  publicId?: string | null,
): Promise<string | null> {
  const db = await getDb();
  for (let attempt = 0; ; attempt++) {
    const next = publicId === undefined ? randomUrlSafeId(16) : publicId;
    try {
      const rows = await db
        .update(questionnaires)
        .set({ publicId: next })
        .where(and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId)))
        .returning({ publicId: questionnaires.publicId });
      if (rows.length === 0) throw new Error("Questionnaire not found");
      return rows[0].publicId;
    } catch (error) {
      if (publicId === undefined && attempt < 3 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}

/** Public share page lookup (not org-scoped: the unguessable id is the capability). */
export async function getByPublicId(publicId: string): Promise<QuestionnaireSummary | null> {
  if (!publicId || publicId.length > 64) return null;
  const db = await getDb();
  const [row] = await db.select(summaryColumns).from(questionnaires).where(eq(questionnaires.publicId, publicId)).limit(1);
  return row ?? null;
}

/** Deletes the questionnaire and (by cascade) its questions and share links. */
export async function remove(orgId: string, questionnaireId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(questionnaires)
    .where(and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId)))
    .returning({ id: questionnaires.id });
  return rows.length > 0;
}
export { remove as delete };
