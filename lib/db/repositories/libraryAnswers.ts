import "server-only";
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../client";
import { libraryAnswers, questions } from "../schema";
import type { LibraryAnswerSummary, LibrarySource } from "../types";
import { NotFoundError, checkedEmbedding, clampLimit, toVectorLiteral } from "./shared";

/** Every column except `embedding`. */
const { embedding: _embedding, ...summaryColumns } = getTableColumns(libraryAnswers);
void _embedding;

export type LibraryAnswerHit = LibraryAnswerSummary & {
  /** Cosine similarity of the question embeddings (1 - distance). */
  score: number;
};

export type UpsertFromQuestionInput = {
  questionId: string;
  /** Defaults to the question's text and final answer. */
  question?: string;
  answer?: string;
  /** Embedding of the question text; omit to keep the existing one (or leave null to embed later). */
  embedding?: number[] | null;
  approvedAt?: Date;
};

/**
 * Spec 3.4: every approved answer (edited or not) goes into the library with
 * source 'questionnaire'. Keyed on question_id, so re-approving or editing
 * the same question updates its library entry instead of duplicating it.
 */
export async function upsertFromQuestion(orgId: string, input: UpsertFromQuestionInput): Promise<LibraryAnswerSummary> {
  const db = await getDb();
  const [question] = await db
    .select({
      id: questions.id,
      questionnaireId: questions.questionnaireId,
      text: questions.text,
      final: questions.final,
      draft: questions.draft,
    })
    .from(questions)
    .where(and(eq(questions.id, input.questionId), eq(questions.orgId, orgId)))
    .limit(1);
  if (!question) throw new NotFoundError("Question");

  const questionText = (input.question ?? question.text).trim();
  const answer = (input.answer ?? question.final ?? question.draft ?? "").trim();
  if (!answer) throw new Error("Cannot add an empty answer to the library.");
  const embedding = input.embedding ? checkedEmbedding(input.embedding) : null;
  const approvedAt = input.approvedAt ?? new Date();

  const [row] = await db
    .insert(libraryAnswers)
    .values({
      orgId,
      question: questionText,
      answer,
      source: "questionnaire",
      questionnaireId: question.questionnaireId,
      questionId: question.id,
      embedding,
      approvedAt,
    })
    .onConflictDoUpdate({
      target: libraryAnswers.questionId,
      targetWhere: sql`${libraryAnswers.questionId} is not null`,
      set: {
        question: questionText,
        answer,
        approvedAt,
        updatedAt: new Date(),
        // A changed question text invalidates the old embedding unless a new one is given.
        embedding:
          input.embedding !== undefined
            ? embedding
            : sql`case when ${libraryAnswers.question} = excluded.question then ${libraryAnswers.embedding} else null end`,
      },
      setWhere: eq(libraryAnswers.orgId, orgId),
    })
    .returning(summaryColumns);
  return row;
}

export type NewLibraryAnswerInput = {
  question: string;
  answer: string;
  source?: Extract<LibrarySource, "import" | "manual">;
  embedding?: number[] | null;
  approvedAt?: Date;
};

const INSERT_BATCH = 100;

/** Past-questionnaire import (source 'import') or manual entries. Blank pairs are skipped. */
export async function insertMany(orgId: string, rows: NewLibraryAnswerInput[]): Promise<LibraryAnswerSummary[]> {
  const values = rows
    .map((row) => ({
      orgId,
      question: row.question.trim(),
      answer: row.answer.trim(),
      source: row.source ?? ("import" as const),
      embedding: row.embedding ? checkedEmbedding(row.embedding) : null,
      approvedAt: row.approvedAt ?? new Date(),
    }))
    .filter((row) => row.question && row.answer);
  if (values.length === 0) return [];
  const db = await getDb();
  return db.transaction(async (tx) => {
    const inserted: LibraryAnswerSummary[] = [];
    for (let i = 0; i < values.length; i += INSERT_BATCH) {
      inserted.push(...(await tx.insert(libraryAnswers).values(values.slice(i, i + INSERT_BATCH)).returning(summaryColumns)));
    }
    return inserted;
  });
}

/** Nearest library answers by cosine distance of the question embeddings, nearest first. */
export async function searchByEmbedding(orgId: string, embedding: number[], limit = 4): Promise<LibraryAnswerHit[]> {
  const vector = toVectorLiteral(embedding);
  const distance = sql<number>`(${libraryAnswers.embedding} <=> ${vector}::vector)`;
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local hnsw.iterative_scan = strict_order`);
    const rows = await tx
      .select({ ...summaryColumns, distance: distance.mapWith(Number) })
      .from(libraryAnswers)
      .where(and(eq(libraryAnswers.orgId, orgId), isNotNull(libraryAnswers.embedding)))
      .orderBy(distance)
      .limit(clampLimit(limit, 4, 100));
    return rows.map(({ distance: d, ...row }) => ({ ...row, score: 1 - d }));
  });
}

/** Citation lookup by id (guardrails, citation panel). */
export async function getByIds(orgId: string, ids: string[]): Promise<LibraryAnswerSummary[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db
    .select(summaryColumns)
    .from(libraryAnswers)
    .where(and(eq(libraryAnswers.orgId, orgId), inArray(libraryAnswers.id, [...new Set(ids)])));
}

/** Newest approval first; optional case-insensitive substring filter on question or answer. */
export async function listForOrg(
  orgId: string,
  options: { search?: string; source?: LibrarySource; limit?: number; offset?: number } = {},
): Promise<LibraryAnswerSummary[]> {
  const db = await getDb();
  const filters = [eq(libraryAnswers.orgId, orgId)];
  if (options.source) filters.push(eq(libraryAnswers.source, options.source));
  const search = options.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    filters.push(or(ilike(libraryAnswers.question, pattern), ilike(libraryAnswers.answer, pattern))!);
  }
  return db
    .select(summaryColumns)
    .from(libraryAnswers)
    .where(and(...filters))
    .orderBy(desc(libraryAnswers.approvedAt), desc(libraryAnswers.createdAt))
    .limit(clampLimit(options.limit, 100, 1000))
    .offset(Math.max(0, Math.floor(options.offset ?? 0)));
}

export async function countForOrg(orgId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(libraryAnswers).where(eq(libraryAnswers.orgId, orgId));
  return row?.n ?? 0;
}

/** Entries still missing an embedding (cron retry). Not org-scoped when orgId is null. */
export async function listMissingEmbeddings(orgId: string | null, limit = 100) {
  const db = await getDb();
  const filters = [isNull(libraryAnswers.embedding)];
  if (orgId) filters.push(eq(libraryAnswers.orgId, orgId));
  return db
    .select({ id: libraryAnswers.id, orgId: libraryAnswers.orgId, question: libraryAnswers.question })
    .from(libraryAnswers)
    .where(and(...filters))
    .orderBy(asc(libraryAnswers.createdAt))
    .limit(clampLimit(limit, 100, 500));
}

export async function setEmbedding(orgId: string, id: string, embedding: number[]): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(libraryAnswers)
    .set({ embedding: checkedEmbedding(embedding) })
    .where(and(eq(libraryAnswers.id, id), eq(libraryAnswers.orgId, orgId)))
    .returning({ id: libraryAnswers.id });
  return rows.length > 0;
}

export async function remove(orgId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(libraryAnswers)
    .where(and(eq(libraryAnswers.id, id), eq(libraryAnswers.orgId, orgId)))
    .returning({ id: libraryAnswers.id });
  return rows.length > 0;
}
export { remove as delete };
