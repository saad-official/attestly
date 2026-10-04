import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as chunksRepo from "@/lib/db/repositories/chunks";
import * as libraryRepo from "@/lib/db/repositories/libraryAnswers";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import * as questionnairesRepo from "@/lib/db/repositories/questionnaires";
import * as questionsRepo from "@/lib/db/repositories/questions";
import * as shareLinksRepo from "@/lib/db/repositories/shareLinks";
import { questionnaires, questions as questionsTable } from "@/lib/db/schema";
import type {
  CitationRef,
  LibrarySource,
  Organization,
  Question,
  QuestionStatus,
  QuestionnaireStatus,
  QuestionnaireSummary,
  ShareLink,
} from "@/lib/db/types";
import { createModelDrafter, draftAnswer, type DraftGenerator } from "@/lib/draft/draft";
import type { AnswerStyle } from "@/lib/draft/prompt";
import { cosineSimilarity } from "@/lib/rag/embeddings";
import { mergeCandidates, type ChunkHit as RagChunkHit, type Evidence } from "@/lib/rag/retrieve";
import { exportAnswersCsv, writeAnswersCsv, type ExportRow } from "@/lib/sheets/csv";
import { readQuestions, type QuestionRow, type SheetColumns, type SheetMapping } from "@/lib/sheets/detect";
import { writeAnswers, type AnswerWrite } from "@/lib/sheets/writeback";
import { NotFoundError, ServiceError, errorMessage, isUuid } from "./errors";
import {
  DEFAULT_SHARE_DAYS,
  PlanLimitError,
  assertProFeature,
  limitsFor,
  monthStartUtc,
} from "./plan-limits";
import {
  audit,
  embedInBatches,
  isDemoQuestionnaire,
  queryEmbedder,
  sleep as defaultSleep,
  type ServiceDeps,
} from "./shared";
import {
  CSV_MIME,
  CSV_SHEET_NAME,
  XLSX_MIME,
  assertUploadSize,
  decodeCsv,
  loadSpreadsheet,
  resolveMapping,
  spreadsheetFormat,
  spreadsheetToXlsxBytes,
  type MappingInput,
  type SpreadsheetFormat,
} from "./spreadsheet";

/**
 * Questionnaires (spec 3.2 to 3.5): intake and mapping, batched drafting with
 * hybrid retrieval and guardrails, review, export, share links and knowledge
 * gaps.
 *
 * Conventions: every function takes the org id (or org row) first. Getters
 * return null when the row is not in the org; mutations throw NotFoundError.
 */

export type { MappingInput } from "./spreadsheet";

export type PlanOptions = {
  /** Demo seeding only: skip the Free-plan checks. */
  skipPlanLimits?: boolean;
};

async function requireOrg(orgId: string): Promise<Organization> {
  const org = await organizationsRepo.getById(orgId);
  if (!org) throw new NotFoundError("Organization");
  return org;
}

async function requireQuestionnaire(orgId: string, questionnaireId: string): Promise<QuestionnaireSummary> {
  if (!isUuid(questionnaireId)) throw new NotFoundError("Questionnaire");
  const q = await questionnairesRepo.getById(orgId, questionnaireId);
  if (!q) throw new NotFoundError("Questionnaire");
  return q;
}

// ---------------------------------------------------------------------------
// Plan limits

/**
 * Free plan: 1 questionnaire a calendar month (UTC). Counts questionnaires
 * whose mapping was confirmed this month (abandoned uploads still in
 * "mapping" and the demo questionnaire do not count).
 */
async function assertQuestionnaireQuota(org: Organization, excludeId?: string, now = new Date()): Promise<void> {
  const limit = limitsFor(org.plan).questionnairesPerMonth;
  if (limit === null) return;
  const since = monthStartUtc(now);
  const created = await questionnairesRepo.countCreatedSince(org.id, since);
  if (created <= (excludeId ? 1 : 0)) return;
  const counted = (await questionnairesRepo.listForOrg(org.id, { limit: 200 })).filter(
    (q) => q.createdAt >= since && q.id !== excludeId && q.status !== "mapping" && !isDemoQuestionnaire(q),
  ).length;
  if (counted < limit) return;
  throw new PlanLimitError(
    "questionnaires_per_month",
    `The Free plan includes ${limit} questionnaire a month, and this month's is used. Upgrade to Pro for unlimited questionnaires.`,
    { limit, used: counted },
  );
}

function assertQuestionLimit(org: Organization, count: number): void {
  const limit = limitsFor(org.plan).questionsPerQuestionnaire;
  if (limit === null || count <= limit) return;
  throw new PlanLimitError(
    "questions_per_questionnaire",
    `This questionnaire has ${count} questions; the Free plan handles up to ${limit}. Upgrade to Pro for unlimited questions.`,
    { limit, used: count },
  );
}

// ---------------------------------------------------------------------------
// Intake and mapping (spec 3.2)

export type MappingPreview = {
  questionnaire: QuestionnaireSummary;
  mapping: SheetMapping;
  /** First 8 questions as the mapping would read them. */
  preview: QuestionRow[];
  /** How many questions the mapping reads in total. */
  questionCount: number;
  format: SpreadsheetFormat;
};

export type CreateQuestionnaireInput = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  name: string;
  customer?: string | null;
};

const PREVIEW_ROWS = 8;

/**
 * Upload (XLSX or CSV, 10 MB max): stores the original file and detects the
 * mapping. The questionnaire stays in status "mapping" until `confirmMapping`.
 * Throws PlanLimitError when the Free monthly questionnaire is used.
 */
export async function createQuestionnaireFromUpload(
  org: Organization,
  input: CreateQuestionnaireInput,
  options: PlanOptions = {},
): Promise<MappingPreview> {
  const fileName = input.fileName.trim() || "questionnaire";
  assertUploadSize(input.bytes, fileName);
  const format = spreadsheetFormat(input.bytes, fileName, input.mimeType);
  const name = input.name.trim() || fileName.replace(/\.[a-z0-9]+$/i, "");
  if (!options.skipPlanLimits) await assertQuestionnaireQuota(org);

  const workbook = await loadSpreadsheet(input.bytes, format);
  const mapping = resolveMapping(workbook, undefined);
  const rows = readQuestions(workbook, mapping);

  const questionnaire = await questionnairesRepo.create(org.id, {
    name,
    customer: input.customer ?? null,
    fileName,
    mimeType: format === "xlsx" ? XLSX_MIME : CSV_MIME,
    original: Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength),
    sheetName: format === "xlsx" ? mapping.sheetName : null,
  });
  await audit({
    orgId: org.id,
    actor: "user",
    type: "questionnaire.uploaded",
    entityType: "questionnaire",
    entityId: questionnaire.id,
    input: { fileName, format, bytes: input.bytes.byteLength },
    output: { sheet: mapping.sheetName, headerRow: mapping.headerRow, questions: rows.length, confidence: mapping.confidence },
  });
  return { questionnaire, mapping, preview: rows.slice(0, PREVIEW_ROWS), questionCount: rows.length, format };
}

async function loadOriginal(orgId: string, questionnaireId: string) {
  const stored = await questionnairesRepo.getOriginal(orgId, questionnaireId);
  if (!stored) throw new NotFoundError("Questionnaire");
  const format = spreadsheetFormat(stored.original, stored.fileName, stored.mimeType);
  return { ...stored, format };
}

/**
 * Re-reads the stored file for the mapping screen (reload, or the user
 * changed a column): returns the resolved mapping and the first 8 questions.
 */
export async function getMappingPreview(
  orgId: string,
  questionnaireId: string,
  mapping?: MappingInput,
): Promise<MappingPreview> {
  const questionnaire = await requireQuestionnaire(orgId, questionnaireId);
  const stored = await loadOriginal(orgId, questionnaireId);
  const workbook = await loadSpreadsheet(stored.original, stored.format);
  const resolved = resolveMapping(workbook, mapping);
  const rows = readQuestions(workbook, resolved);
  return {
    questionnaire,
    mapping: resolved,
    preview: rows.slice(0, PREVIEW_ROWS),
    questionCount: rows.length,
    format: stored.format,
  };
}

export type ConfirmMappingResult = {
  questionnaire: QuestionnaireSummary;
  questionCount: number;
};

/**
 * Confirms the mapping: reads every question, stores the mapping, inserts the
 * questions as `pending` and moves the questionnaire to "drafting". Enforces
 * the Free limits (1 questionnaire a month, 100 questions) with
 * PlanLimitError. Throws ServiceError("conflict") if it was already confirmed.
 */
export async function confirmMapping(
  orgId: string,
  questionnaireId: string,
  mapping: MappingInput | SheetMapping,
  options: PlanOptions = {},
): Promise<ConfirmMappingResult> {
  const questionnaire = await requireQuestionnaire(orgId, questionnaireId);
  if (questionnaire.status !== "mapping") {
    throw new ServiceError("conflict", "The mapping for this questionnaire is already confirmed.");
  }
  const org = await requireOrg(orgId);
  const stored = await loadOriginal(orgId, questionnaireId);
  const workbook = await loadSpreadsheet(stored.original, stored.format);
  const resolved = resolveMapping(workbook, mapping);
  const rows = readQuestions(workbook, resolved);
  if (rows.length === 0) {
    throw new ServiceError("invalid_input", "No questions were found with this mapping. Check the question column and header row.");
  }
  if (!options.skipPlanLimits && !isDemoQuestionnaire(questionnaire)) {
    await assertQuestionnaireQuota(org, questionnaireId);
    assertQuestionLimit(org, rows.length);
  }

  // Claim the transition atomically so a double submit cannot insert the questions twice.
  const db = await getDb();
  const claimed = await db
    .update(questionnaires)
    .set({
      status: "drafting",
      sheetName: stored.format === "xlsx" ? resolved.sheetName : null,
      headerRow: resolved.headerRow,
      questionCol: resolved.columns.question,
      answerCol: resolved.columns.answer ?? null,
      commentCol: resolved.columns.comment ?? null,
      idCol: resolved.columns.id ?? null,
    })
    .where(
      and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId), eq(questionnaires.status, "mapping")),
    )
    .returning({ id: questionnaires.id });
  if (claimed.length === 0) throw new ServiceError("conflict", "The mapping for this questionnaire is already confirmed.");

  let inserted: number;
  try {
    inserted = await questionsRepo.bulkInsert(
      orgId,
      questionnaireId,
      rows.map((r) => ({ rowNumber: r.rowNumber, text: r.text, section: r.section ?? null, externalId: r.externalId ?? null })),
    );
  } catch (error) {
    await questionnairesRepo.updateStatus(orgId, questionnaireId, "mapping");
    throw error;
  }
  const updated = (await questionnairesRepo.refreshCounts(orgId, questionnaireId)) ?? questionnaire;
  await audit({
    orgId,
    actor: "user",
    type: "questionnaire.mapping_confirmed",
    entityType: "questionnaire",
    entityId: questionnaireId,
    input: { sheet: resolved.sheetName, headerRow: resolved.headerRow, columns: { ...resolved.columns } },
    output: { questions: inserted, sections: resolved.sections.length },
  });
  return { questionnaire: updated, questionCount: inserted };
}

/** Newest first (no workbook bytes). */
export async function listQuestionnaires(
  orgId: string,
  options: { status?: QuestionnaireStatus; limit?: number } = {},
): Promise<QuestionnaireSummary[]> {
  return questionnairesRepo.listForOrg(orgId, options);
}

/** Deletes the questionnaire with its questions and share links. Library answers it produced stay. */
export async function deleteQuestionnaire(orgId: string, questionnaireId: string): Promise<boolean> {
  if (!isUuid(questionnaireId)) return false;
  const removed = await questionnairesRepo.remove(orgId, questionnaireId);
  if (removed) {
    await audit({ orgId, actor: "user", type: "questionnaire.deleted", entityType: "questionnaire", entityId: questionnaireId });
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Drafting (spec 3.3)

export type DraftDeps = ServiceDeps & {
  /** Draft writer; defaults to the Groq/Gemini model drafter. */
  generate?: DraftGenerator;
  /** Pause between model calls (Groq free tier: 30 requests a minute). Default 300 ms. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  answerStyle?: AnswerStyle;
  /** Stop starting new questions after this long, so the request ends inside maxDuration. Default 240 s. */
  budgetMs?: number;
};

export type DraftBatchOptions = {
  /** Questions per batch (spec 3.3: 15). */
  limit?: number;
  deps?: DraftDeps;
};

export type QuestionCounts = questionsRepo.QuestionCounts;

export type DraftBatchResult = {
  /** Questions handled in this batch (including failed ones). */
  processed: number;
  /** Of those, how many failed to draft (marked needs_evidence with a "Drafting failed" note). */
  failed: number;
  /** Questions still pending; the client calls again while this is > 0. */
  remaining: number;
  status: QuestionnaireStatus;
  counts: QuestionCounts;
  /** True when another batch for this questionnaire was already running (nothing was done). */
  busy: boolean;
};

export const DEFAULT_DRAFT_BATCH = 15;
const MODEL_DELAY_MS = 300;
const DRAFT_BUDGET_MS = 240_000;
const VECTOR_TOP_K = 8;
const KEYWORD_TOP_K = 8;
const LIBRARY_TOP_K = 4;

/** In-process guard against overlapping batches (double clicks, two tabs). */
const inFlight = new Set<string>();

function isAiUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === "AiUnavailableError";
}

function queryText(q: Pick<Question, "text" | "section">): string {
  return q.section ? `${q.section}: ${q.text}` : q.text;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

async function finishBatch(
  orgId: string,
  questionnaire: QuestionnaireSummary,
  partial: { processed: number; failed: number; busy: boolean },
): Promise<DraftBatchResult> {
  await questionnairesRepo.refreshCounts(orgId, questionnaire.id);
  const counts = await questionsRepo.counts(orgId, questionnaire.id);
  let status = questionnaire.status;
  if (counts.pending === 0 && status === "drafting") {
    status = (await questionnairesRepo.updateStatus(orgId, questionnaire.id, "review"))?.status ?? "review";
    await audit({
      orgId,
      actor: "agent",
      type: "questionnaire.drafting_complete",
      entityType: "questionnaire",
      entityId: questionnaire.id,
      output: { drafted: counts.drafted, needsEvidence: counts.needs_evidence, notApplicable: counts.not_applicable },
    });
  }
  return { ...partial, remaining: counts.pending, status, counts };
}

/**
 * Drafts the next batch of pending questions (spec 3.3). Per question: hybrid
 * retrieval (chunk vectors top 8, chunk keywords top 8, library vectors top
 * 4) merged with reciprocal rank fusion, the draft writer, deterministic
 * guardrails, then `questions.updateDraft` and a `question.drafted` event. A
 * model error marks that question needs_evidence ("Drafting failed: ...")
 * and the batch continues; only a missing AI configuration aborts it
 * (AiUnavailableError). When no pending questions remain the questionnaire
 * moves to "review".
 */
export async function draftBatch(
  orgId: string,
  questionnaireId: string,
  options: DraftBatchOptions = {},
): Promise<DraftBatchResult> {
  const questionnaire = await requireQuestionnaire(orgId, questionnaireId);
  if (questionnaire.status === "mapping") {
    throw new ServiceError("conflict", "Confirm the column mapping before drafting.");
  }
  if (inFlight.has(questionnaireId)) return finishBatch(orgId, questionnaire, { processed: 0, failed: 0, busy: true });
  inFlight.add(questionnaireId);
  try {
    return await runBatch(orgId, questionnaire, options);
  } finally {
    inFlight.delete(questionnaireId);
  }
}

async function runBatch(
  orgId: string,
  questionnaire: QuestionnaireSummary,
  options: DraftBatchOptions,
): Promise<DraftBatchResult> {
  const deps = options.deps ?? {};
  const limit = Math.min(Math.max(1, Math.floor(options.limit ?? DEFAULT_DRAFT_BATCH)), 50);
  const generate = deps.generate ?? createModelDrafter();
  const pause = deps.sleep ?? defaultSleep;
  const delayMs = deps.delayMs ?? MODEL_DELAY_MS;
  const budgetMs = deps.budgetMs ?? DRAFT_BUDGET_MS;
  const started = Date.now();

  const pending = await questionsRepo.nextPending(orgId, questionnaire.id, limit);
  if (pending.length === 0) return finishBatch(orgId, questionnaire, { processed: 0, failed: 0, busy: false });
  const org = await requireOrg(orgId);

  // One embedding call for the whole batch. If it fails, retrieval falls back to keywords only.
  let vectors: Array<number[] | null> = pending.map(() => null);
  let embeddingError: string | null = null;
  try {
    vectors = await embedInBatches(queryEmbedder(deps), pending.map(queryText));
  } catch (error) {
    embeddingError = errorMessage(error);
    console.warn("[draft] query embedding failed; keyword retrieval only:", embeddingError);
  }

  let processed = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i++) {
    if (i > 0 && Date.now() - started > budgetMs) break;
    if (i > 0 && delayMs > 0) await pause(delayMs);
    const question = pending[i];
    const query = queryText(question);
    const vector = vectors[i];
    let retrieval: Record<string, unknown> = { query };
    try {
      const [vectorHits, keywordHits, libraryHits] = await Promise.all([
        vector ? chunksRepo.searchByEmbedding(orgId, vector, VECTOR_TOP_K) : Promise.resolve([]),
        chunksRepo.searchByKeywords(orgId, query, KEYWORD_TOP_K),
        vector ? libraryRepo.searchByEmbedding(orgId, vector, LIBRARY_TOP_K) : Promise.resolve([]),
      ]);
      const toRag = (h: chunksRepo.ChunkHit): RagChunkHit => ({
        id: h.id,
        text: h.text,
        title: h.documentTitle,
        headingPath: h.headingPath,
      });
      const evidence: Evidence[] = mergeCandidates({
        vectorHits: vectorHits.map(toRag),
        keywordHits: keywordHits.map(toRag),
        libraryHits: libraryHits.map((h) => ({ id: h.id, question: h.question, answer: h.answer })),
      });
      retrieval = {
        query,
        evidence: evidence.map((e) => ({ kind: e.kind, id: e.id, score: round(e.score) })),
        vector: vectorHits.map((h) => ({ id: h.id, score: round(h.score) })),
        keyword: keywordHits.map((h) => ({ id: h.id, score: round(h.score) })),
        library: libraryHits.map((h) => ({ id: h.id, score: round(h.score) })),
        ...(embeddingError ? { embeddingError } : {}),
      };

      const result = await draftAnswer(
        {
          question: question.text,
          ...(question.section ? { section: question.section } : {}),
          evidence,
          companyName: org.name,
          answerStyle: deps.answerStyle ?? "concise",
        },
        { generate },
      );
      const kindById = new Map(evidence.map((e) => [e.id, e.kind]));
      const citations: CitationRef[] = result.draft.citations.map((c) =>
        kindById.get(c.id) === "library" ? { libraryAnswerId: c.id, quote: c.quote } : { chunkId: c.id, quote: c.quote },
      );
      const violations = result.violations.map((v) => v.code);
      await questionsRepo.updateDraft(orgId, question.id, {
        draft: result.draft.answer,
        status: result.draft.status,
        confidence: result.draft.confidence,
        citations,
        retrieval: { ...retrieval, guardrails: violations },
        notes: result.draft.notes?.trim() || null,
      });
      await audit({
        orgId,
        actor: "agent",
        type: "question.drafted",
        entityType: "question",
        entityId: question.id,
        input: { questionnaireId: questionnaire.id, evidence: evidence.length },
        output: {
          status: result.draft.status,
          confidence: result.draft.confidence,
          citations: citations.length,
          violations,
        },
        ...(result.meta ? { meta: result.meta } : {}),
      });
    } catch (error) {
      if (isAiUnavailable(error)) {
        await questionnairesRepo.refreshCounts(orgId, questionnaire.id);
        throw error;
      }
      failed += 1;
      const reason = errorMessage(error).replace(/\s+/g, " ").slice(0, 200);
      await questionsRepo.updateDraft(orgId, question.id, {
        draft: "",
        status: "needs_evidence",
        confidence: 0,
        citations: [],
        retrieval: { ...retrieval, error: reason },
        notes: `Drafting failed: ${reason}`,
      });
      await audit({
        orgId,
        actor: "agent",
        type: "question.draft_failed",
        entityType: "question",
        entityId: question.id,
        input: { questionnaireId: questionnaire.id },
        output: { error: reason },
      });
    }
    processed += 1;
  }

  return finishBatch(orgId, questionnaire, { processed, failed, busy: false });
}

// ---------------------------------------------------------------------------
// Review (spec 3.4)

export type ReviewAction = "approve" | "edit" | "not_applicable" | "needs_evidence" | "reopen";

export type ReviewInput = {
  /**
   * approve: accept the draft (or `final` if given). edit: approve with the
   * edited `final` (required). not_applicable: optional `final` text
   * (default "Not applicable."). needs_evidence: assign as a task, `notes`
   * says what is missing. reopen: back to the agent's draft.
   */
  action: ReviewAction;
  final?: string | null;
  notes?: string | null;
};

export type ReviewResult = {
  question: Question;
  questionnaire: QuestionnaireSummary;
  /** The library entry upserted on approval (null otherwise, or if the upsert failed). */
  libraryAnswerId: string | null;
};

const MAX_ANSWER_CHARS = 8000;

/**
 * Moves the questionnaire between "review" and "done": done when every
 * question is approved or not applicable, back to review when one reopens.
 */
async function syncReviewStatus(orgId: string, questionnaireId: string): Promise<QuestionnaireSummary> {
  const q = await questionnairesRepo.refreshCounts(orgId, questionnaireId);
  if (!q) throw new NotFoundError("Questionnaire");
  if (q.status !== "review" && q.status !== "done") return q;
  const counts = await questionsRepo.counts(orgId, questionnaireId);
  const open = counts.pending + counts.drafted + counts.needs_evidence;
  const next: QuestionnaireStatus = open === 0 && counts.total > 0 ? "done" : "review";
  if (next === q.status) return q;
  return (await questionnairesRepo.updateStatus(orgId, questionnaireId, next)) ?? q;
}

async function upsertLibrary(
  orgId: string,
  rows: Array<Pick<Question, "id" | "text">>,
  deps?: ServiceDeps,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (rows.length === 0) return ids;
  let vectors: Array<number[] | undefined> = rows.map(() => undefined);
  try {
    vectors = await embedInBatches(queryEmbedder(deps), rows.map((r) => r.text));
  } catch (error) {
    console.warn("[review] library embedding failed; the daily job embeds later:", errorMessage(error));
  }
  for (let i = 0; i < rows.length; i++) {
    try {
      const entry = await libraryRepo.upsertFromQuestion(orgId, {
        questionId: rows[i].id,
        ...(vectors[i] ? { embedding: vectors[i] } : {}),
      });
      ids.set(rows[i].id, entry.id);
    } catch (error) {
      console.warn(`[review] library upsert failed for question ${rows[i].id}:`, errorMessage(error));
    }
  }
  return ids;
}

async function setNotes(orgId: string, questionId: string, notes: string | null): Promise<void> {
  const db = await getDb();
  await db
    .update(questionsTable)
    .set({ notes })
    .where(and(eq(questionsTable.id, questionId), eq(questionsTable.orgId, orgId)));
}

/**
 * A reviewer decision on one question. Approving (or editing) upserts the
 * answer into the library (source "questionnaire", embedded on the question
 * text). Refreshes the counters and logs the decision.
 */
export async function reviewQuestion(
  orgId: string,
  questionId: string,
  input: ReviewInput,
  userId: string,
  deps?: ServiceDeps,
): Promise<ReviewResult> {
  if (!isUuid(questionId)) throw new NotFoundError("Question");
  const current = await questionsRepo.getById(orgId, questionId);
  if (!current) throw new NotFoundError("Question");
  const final = input.final?.trim() || null;
  if (final && final.length > MAX_ANSWER_CHARS) {
    throw new ServiceError("invalid_input", `Answers are limited to ${MAX_ANSWER_CHARS} characters.`);
  }
  const notes = input.notes === undefined ? undefined : input.notes?.trim() || null;

  let updated: Question | null;
  switch (input.action) {
    case "approve":
    case "edit": {
      if (input.action === "edit" && !final) throw new ServiceError("invalid_input", "Write the edited answer before saving.");
      if (!(final || current.final?.trim() || current.draft?.trim())) {
        throw new ServiceError("invalid_input", "There is no answer to approve yet. Write one first.");
      }
      updated = await questionsRepo.review(orgId, questionId, userId, { action: "approve", final });
      if (updated && notes !== undefined) {
        await setNotes(orgId, questionId, notes);
        updated = { ...updated, notes };
      }
      break;
    }
    case "not_applicable":
      updated = await questionsRepo.review(orgId, questionId, userId, {
        action: "not_applicable",
        final,
        ...(notes !== undefined ? { notes } : {}),
      });
      break;
    case "needs_evidence":
      updated = await questionsRepo.review(orgId, questionId, userId, {
        action: "needs_evidence",
        ...(notes !== undefined ? { notes } : {}),
      });
      break;
    case "reopen":
      updated = await questionsRepo.review(orgId, questionId, userId, { action: "reopen" });
      break;
    default:
      throw new ServiceError("invalid_input", "Unknown review action.");
  }
  if (!updated) throw new NotFoundError("Question");

  let libraryAnswerId: string | null = null;
  if (updated.status === "approved") {
    libraryAnswerId = (await upsertLibrary(orgId, [updated], deps)).get(updated.id) ?? null;
  }
  const questionnaire = await syncReviewStatus(orgId, updated.questionnaireId);
  await audit({
    orgId,
    actor: "user",
    type: updated.status === "approved" ? "question.approved" : "question.reviewed",
    entityType: "question",
    entityId: questionId,
    input: { action: input.action, edited: Boolean(final) && final !== current.draft, userId },
    output: { status: updated.status, libraryAnswerId },
  });
  return { question: updated, questionnaire, libraryAnswerId };
}

export type BulkApproveResult = {
  approved: number;
  questionIds: string[];
  libraryAnswers: number;
  questionnaire: QuestionnaireSummary;
};

/**
 * Approves every `drafted` question with confidence >= `minConfidence`
 * (0..1) and upserts each into the library. `userId` is recorded as the
 * reviewer.
 */
export async function bulkApprove(
  orgId: string,
  questionnaireId: string,
  minConfidence: number,
  userId: string,
  deps?: ServiceDeps,
): Promise<BulkApproveResult> {
  await requireQuestionnaire(orgId, questionnaireId);
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new ServiceError("invalid_input", "The confidence threshold must be between 0 and 1.");
  }
  const rows = await questionsRepo.bulkApprove(orgId, questionnaireId, userId, minConfidence);
  const library = await upsertLibrary(
    orgId,
    rows.filter((r) => (r.final ?? "").trim().length > 0),
    deps,
  );
  const questionnaire = await syncReviewStatus(orgId, questionnaireId);
  await audit({
    orgId,
    actor: "user",
    type: "questionnaire.bulk_approved",
    entityType: "questionnaire",
    entityId: questionnaireId,
    input: { minConfidence, userId },
    output: { approved: rows.length, libraryAnswers: library.size },
  });
  return { approved: rows.length, questionIds: rows.map((r) => r.id), libraryAnswers: library.size, questionnaire };
}

// ---------------------------------------------------------------------------
// Detail with citation sources

export type CitationSource = {
  id: string;
  kind: "chunk" | "library";
  /** Document title for chunks; "Answer library" for library answers. */
  title: string;
  /** Heading trail for chunks; [past question] for library answers. */
  headingPath: string[];
  /** The cited passage (chunk text, or the library answer). */
  text: string;
  documentId: string | null;
  /** Library answers only: the past question. */
  question: string | null;
  /** Library answers only. */
  librarySource: LibrarySource | null;
};

export type QuestionnaireDetail = {
  questionnaire: QuestionnaireSummary;
  questions: Question[];
  /**
   * Every cited chunk / library answer by id. A citation whose id is missing
   * here points at a deleted document or library entry ("source removed").
   */
  sourcesById: Record<string, CitationSource>;
  counts: QuestionCounts;
  /** The confirmed mapping (null while the questionnaire is still in "mapping"). */
  mapping: { sheetName: string | null; headerRow: number; columns: SheetColumns } | null;
};

async function resolveSources(orgId: string, rows: Array<Pick<Question, "citations">>): Promise<Record<string, CitationSource>> {
  const chunkIds = new Set<string>();
  const libraryIds = new Set<string>();
  for (const row of rows) {
    for (const c of row.citations ?? []) {
      if (c.chunkId && isUuid(c.chunkId)) chunkIds.add(c.chunkId);
      if (c.libraryAnswerId && isUuid(c.libraryAnswerId)) libraryIds.add(c.libraryAnswerId);
    }
  }
  const [chunkRows, libraryRows] = await Promise.all([
    chunksRepo.getByIds(orgId, [...chunkIds]),
    libraryRepo.getByIds(orgId, [...libraryIds]),
  ]);
  const sources: Record<string, CitationSource> = {};
  for (const c of chunkRows) {
    sources[c.id] = {
      id: c.id,
      kind: "chunk",
      title: c.documentTitle,
      headingPath: c.headingPath,
      text: c.text,
      documentId: c.documentId,
      question: null,
      librarySource: null,
    };
  }
  for (const a of libraryRows) {
    sources[a.id] = {
      id: a.id,
      kind: "library",
      title: "Answer library",
      headingPath: [a.question],
      text: a.answer,
      documentId: null,
      question: a.question,
      librarySource: a.source,
    };
  }
  return sources;
}

function storedMapping(q: QuestionnaireSummary): QuestionnaireDetail["mapping"] {
  if (q.questionCol === null) return null;
  return {
    sheetName: q.sheetName,
    headerRow: q.headerRow ?? 0,
    columns: {
      question: q.questionCol,
      ...(q.answerCol !== null ? { answer: q.answerCol } : {}),
      ...(q.commentCol !== null ? { comment: q.commentCol } : {}),
      ...(q.idCol !== null ? { id: q.idCol } : {}),
    },
  };
}

/** The review grid's data. Null when the questionnaire is not in the org. */
export async function getQuestionnaireDetail(orgId: string, questionnaireId: string): Promise<QuestionnaireDetail | null> {
  if (!isUuid(questionnaireId)) return null;
  const questionnaire = await questionnairesRepo.getById(orgId, questionnaireId);
  if (!questionnaire) return null;
  const [questions, counts] = await Promise.all([
    questionsRepo.listForQuestionnaire(orgId, questionnaireId),
    questionsRepo.counts(orgId, questionnaireId),
  ]);
  const sourcesById = await resolveSources(orgId, questions);
  return { questionnaire, questions, sourcesById, counts, mapping: storedMapping(questionnaire) };
}

// ---------------------------------------------------------------------------
// Export (spec 3.5)

export type ExportFormat = "xlsx" | "csv";

export type ExportedFile = {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
};

/** "Needs evidence: <note>" (comment column / flat CSV). */
export function needsEvidenceComment(notes: string | null): string {
  return `Needs evidence: ${notes?.trim() || "no supporting policy was found."}`;
}

function answerFor(q: Question): string | null {
  switch (q.status) {
    case "approved":
      return q.final ?? q.draft ?? "";
    case "drafted":
      return q.draft ?? "";
    case "not_applicable":
      return q.final ?? q.draft ?? "Not applicable.";
    default:
      return null;
  }
}

function fileSlug(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "questionnaire"
  );
}

const STATUS_LABEL: Record<QuestionStatus, string> = {
  pending: "Pending",
  drafted: "Drafted",
  needs_evidence: "Needs evidence",
  not_applicable: "Not applicable",
  approved: "Approved",
};

/**
 * Export bytes. CSV (all plans): a CSV original gets its answers written back
 * into the mapped columns; an XLSX original gets a flat CSV (ID, Section,
 * Question, Answer, Status, Comment). XLSX (Pro, PlanLimitError on Free): the
 * customer's original workbook with answers in the mapped answer cells (a
 * CSV original is converted to a workbook first). Approved and drafted rows
 * export final ?? draft; needs-evidence rows get "Needs evidence: <note>" in
 * the comment column when there is one.
 */
export async function exportQuestionnaire(
  orgId: string,
  questionnaireId: string,
  format: ExportFormat,
): Promise<ExportedFile> {
  if (format !== "xlsx" && format !== "csv") throw new ServiceError("invalid_input", "Export format must be xlsx or csv.");
  const questionnaire = await requireQuestionnaire(orgId, questionnaireId);
  const mapping = storedMapping(questionnaire);
  if (!mapping) throw new ServiceError("conflict", "Confirm the column mapping before exporting.");
  if (format === "xlsx") assertProFeature(await requireOrg(orgId), "xlsx_export");

  const [stored, rows] = await Promise.all([
    loadOriginal(orgId, questionnaireId),
    questionsRepo.listForQuestionnaire(orgId, questionnaireId),
  ]);
  const hasComment = mapping.columns.comment !== undefined;
  const writes: AnswerWrite[] = [];
  for (const q of rows) {
    const answer = answerFor(q);
    if (answer !== null && answer.trim()) writes.push({ rowNumber: q.rowNumber, answer });
    else if (q.status === "needs_evidence" && hasComment) {
      writes.push({ rowNumber: q.rowNumber, answer: "", comment: needsEvidenceComment(q.notes) });
    }
  }

  const base = `${fileSlug(questionnaire.name)}-attestly`;
  let file: ExportedFile;
  if (format === "xlsx") {
    const source = await spreadsheetToXlsxBytes(stored.original, stored.format);
    const bytes = await writeAnswers(
      source,
      { sheetName: mapping.sheetName ?? CSV_SHEET_NAME, headerRow: mapping.headerRow, columns: mapping.columns },
      writes,
    );
    file = { bytes, fileName: `${base}.xlsx`, contentType: XLSX_MIME };
  } else if (stored.format === "csv") {
    const text = writeAnswersCsv(decodeCsv(stored.original), { headerRow: mapping.headerRow, columns: mapping.columns }, writes);
    file = { bytes: new TextEncoder().encode(text), fileName: `${base}.csv`, contentType: "text/csv; charset=utf-8" };
  } else {
    const flat: ExportRow[] = rows.map((q) => ({
      externalId: q.externalId ?? undefined,
      section: q.section ?? undefined,
      question: q.text,
      answer: answerFor(q) ?? "",
      status: STATUS_LABEL[q.status],
      ...(q.status === "needs_evidence" ? { comment: needsEvidenceComment(q.notes) } : {}),
    }));
    const text = exportAnswersCsv(flat);
    file = { bytes: new TextEncoder().encode(text), fileName: `${base}.csv`, contentType: "text/csv; charset=utf-8" };
  }
  await audit({
    orgId,
    actor: "user",
    type: "questionnaire.exported",
    entityType: "questionnaire",
    entityId: questionnaireId,
    input: { format },
    output: { answers: writes.length, bytes: file.bytes.byteLength },
  });
  return file;
}

// ---------------------------------------------------------------------------
// Share links (Pro)

export type ShareLinkWithPath = ShareLink & {
  /** App-relative path of the read-only page: /s/<publicId>. */
  path: string;
};

const withPath = (link: ShareLink): ShareLinkWithPath => ({ ...link, path: `/s/${link.publicId}` });

/** A read-only review link valid for `days` days (1..365). Pro only (PlanLimitError on Free). */
export async function createShareLink(
  orgId: string,
  questionnaireId: string,
  days = DEFAULT_SHARE_DAYS,
): Promise<ShareLinkWithPath> {
  assertProFeature(await requireOrg(orgId), "share_links");
  await requireQuestionnaire(orgId, questionnaireId);
  const link = await shareLinksRepo.create(orgId, questionnaireId, { ttlDays: days });
  await audit({
    orgId,
    actor: "user",
    type: "share_link.created",
    entityType: "share_link",
    entityId: link.id,
    input: { questionnaireId, days },
  });
  return withPath(link);
}

/** Active and expired-but-not-yet-purged links, newest first. */
export async function listShareLinks(orgId: string, questionnaireId: string): Promise<ShareLinkWithPath[]> {
  if (!isUuid(questionnaireId)) return [];
  return (await shareLinksRepo.listForQuestionnaire(orgId, questionnaireId)).map(withPath);
}

export async function revokeShareLink(orgId: string, shareLinkId: string): Promise<boolean> {
  if (!isUuid(shareLinkId)) return false;
  const revoked = await shareLinksRepo.revoke(orgId, shareLinkId);
  if (revoked) await audit({ orgId, actor: "user", type: "share_link.revoked", entityType: "share_link", entityId: shareLinkId });
  return revoked;
}

export type SharedQuestion = Pick<
  Question,
  "id" | "rowNumber" | "section" | "externalId" | "text" | "status" | "confidence" | "citations" | "notes"
> & {
  /** final ?? draft. */
  answer: string | null;
};

export type SharedQuestionnaire = {
  companyName: string;
  questionnaire: Pick<
    QuestionnaireSummary,
    | "id"
    | "name"
    | "customer"
    | "status"
    | "questionCount"
    | "draftedCount"
    | "approvedCount"
    | "needsEvidenceCount"
    | "createdAt"
    | "updatedAt"
  >;
  questions: SharedQuestion[];
  sourcesById: Record<string, CitationSource>;
  expiresAt: Date;
};

/**
 * The public read-only page (/s/[publicId], noindex). Null when the link is
 * unknown or expired. Not org-scoped by the caller: the unguessable id is the
 * capability, and everything is then loaded within the link's org. Reviewer
 * ids and retrieval internals are left out.
 */
export async function getSharedQuestionnaire(publicId: string): Promise<SharedQuestionnaire | null> {
  if (typeof publicId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(publicId)) return null;
  const link = await shareLinksRepo.getByPublicId(publicId);
  if (!link) return null;
  const [questionnaire, org] = await Promise.all([
    questionnairesRepo.getById(link.orgId, link.questionnaireId),
    organizationsRepo.getById(link.orgId),
  ]);
  if (!questionnaire || !org) return null;
  const rows = await questionsRepo.listForQuestionnaire(link.orgId, link.questionnaireId);
  const sourcesById = await resolveSources(link.orgId, rows);
  return {
    companyName: org.name,
    questionnaire: {
      id: questionnaire.id,
      name: questionnaire.name,
      customer: questionnaire.customer,
      status: questionnaire.status,
      questionCount: questionnaire.questionCount,
      draftedCount: questionnaire.draftedCount,
      approvedCount: questionnaire.approvedCount,
      needsEvidenceCount: questionnaire.needsEvidenceCount,
      createdAt: questionnaire.createdAt,
      updatedAt: questionnaire.updatedAt,
    },
    questions: rows.map((q) => ({
      id: q.id,
      rowNumber: q.rowNumber,
      section: q.section,
      externalId: q.externalId,
      text: q.text,
      status: q.status,
      confidence: q.confidence,
      citations: q.citations,
      notes: q.notes,
      answer: q.final ?? q.draft,
    })),
    sourcesById,
    expiresAt: link.expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Knowledge gaps (spec 3.6)

export type KnowledgeGapQuestion = {
  id: string;
  text: string;
  notes: string | null;
  questionnaireId: string;
  questionnaireName: string;
};

export type KnowledgeGap = {
  /** The first question's first six words. */
  label: string;
  questionIds: string[];
  count: number;
  questions: KnowledgeGapQuestion[];
};

export const GAP_SIMILARITY = 0.82;
export const GAP_MAX_QUESTIONS = 60;

function gapLabel(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const head = words.slice(0, 6).join(" ").replace(/[?.,;:!]+$/, "");
  return words.length > 6 ? `${head}…` : head;
}

/**
 * Clusters of `needs_evidence` questions (up to 60, oldest first) that tell
 * the owner which policy to write next. Question texts are embedded on the
 * fly and grouped greedily: each question joins the first cluster whose seed
 * question has cosine similarity >= 0.82, else starts a new one. Largest
 * clusters first. No model call. If embedding fails every question is its
 * own group.
 */
export async function knowledgeGaps(orgId: string, deps?: ServiceDeps): Promise<KnowledgeGap[]> {
  const rows = await questionsRepo.listNeedsEvidence(orgId, GAP_MAX_QUESTIONS);
  if (rows.length === 0) return [];
  let vectors: number[][] | null = null;
  try {
    vectors = await embedInBatches(queryEmbedder(deps), rows.map((r) => r.text));
  } catch (error) {
    console.warn("[gaps] embedding failed; returning ungrouped gaps:", errorMessage(error));
  }

  const clusters: Array<{ seed: number; members: number[] }> = [];
  rows.forEach((_, i) => {
    const home = vectors ? clusters.find((c) => cosineSimilarity(vectors[c.seed], vectors[i]) >= GAP_SIMILARITY) : undefined;
    if (home) home.members.push(i);
    else clusters.push({ seed: i, members: [i] });
  });

  return clusters
    .sort((a, b) => b.members.length - a.members.length || a.seed - b.seed)
    .map((c) => {
      const members = c.members.map((i) => rows[i]);
      return {
        label: gapLabel(rows[c.seed].text),
        questionIds: members.map((m) => m.id),
        count: members.length,
        questions: members.map((m) => ({
          id: m.id,
          text: m.text,
          notes: m.notes,
          questionnaireId: m.questionnaireId,
          questionnaireName: m.questionnaireName,
        })),
      };
    });
}
