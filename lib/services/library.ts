import "server-only";
import Papa from "papaparse";
import * as libraryRepo from "@/lib/db/repositories/libraryAnswers";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import type { LibraryAnswerSummary, LibrarySource } from "@/lib/db/types";
import { neutralizeFormula } from "@/lib/sheets/csv";
import { readQuestions, type SheetMapping } from "@/lib/sheets/detect";
import { NotFoundError, ServiceError, errorMessage, isUuid } from "./errors";
import { assertProFeature } from "./plan-limits";
import { audit, embedInBatches, queryEmbedder, type ServiceDeps } from "./shared";
import {
  assertUploadSize,
  loadSpreadsheet,
  readCell,
  resolveMapping,
  spreadsheetFormat,
  type MappingInput,
} from "./spreadsheet";

/**
 * Answer library (spec 3.1, 3.4): past questionnaire imports, manual entries
 * and every approved answer (upserted by the questionnaires service). Each
 * entry is embedded on its question text so drafting can find it.
 */

/** Rows read from one import. */
const MAX_IMPORT_ROWS = 2000;
const MAX_FIELD_CHARS = 8000;

export type ImportLibraryResult = {
  /** Pairs added to the library. */
  imported: number;
  /** Rows with a question but no answer. */
  skippedEmpty: number;
  /** Pairs already in the library (same question and answer). */
  skippedDuplicates: number;
  /** False when embedding failed; the daily job embeds them later. */
  embedded: boolean;
  mapping: SheetMapping;
};

function normalizePair(question: string, answer: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(question)}\u0000${norm(answer)}`;
}

/** Embeds question texts; on failure returns nulls so the rows are stored and the cron embeds them. */
async function embedQuestions(texts: string[], deps?: ServiceDeps): Promise<{ vectors: Array<number[] | null>; ok: boolean }> {
  if (texts.length === 0) return { vectors: [], ok: true };
  try {
    return { vectors: await embedInBatches(queryEmbedder(deps), texts), ok: true };
  } catch (error) {
    console.warn("[library] embedding failed; stored without vectors:", errorMessage(error));
    return { vectors: texts.map(() => null), ok: false };
  }
}

/**
 * Imports a past questionnaire (XLSX or CSV bytes) into the library. Columns
 * are detected with lib/sheets (the same detection as questionnaire intake);
 * pass `mapping` to override the question/answer columns. Rows without an
 * answer and pairs already in the library are skipped.
 */
export async function importLibraryFromWorkbook(
  orgId: string,
  bytes: Uint8Array,
  mapping?: MappingInput,
  deps?: ServiceDeps & { fileName?: string; mimeType?: string },
): Promise<ImportLibraryResult> {
  assertUploadSize(bytes, deps?.fileName ?? "The file");
  const workbook = await loadSpreadsheet(bytes, spreadsheetFormat(bytes, deps?.fileName, deps?.mimeType));
  const resolved = resolveMapping(workbook, mapping);
  const answerCol = resolved.columns.answer;
  if (answerCol === undefined) {
    throw new ServiceError(
      "invalid_input",
      "No answer column was found. Choose which column holds the answers to import past questionnaires.",
    );
  }

  const rows = readQuestions(workbook, resolved).slice(0, MAX_IMPORT_ROWS);
  const existing = new Set(
    (await libraryRepo.listForOrg(orgId, { limit: 1000 })).map((a) => normalizePair(a.question, a.answer)),
  );
  let skippedEmpty = 0;
  let skippedDuplicates = 0;
  const pairs: Array<{ question: string; answer: string }> = [];
  for (const row of rows) {
    const answer = readCell(workbook, resolved.sheetName, row.rowNumber, answerCol).slice(0, MAX_FIELD_CHARS);
    if (!answer) {
      skippedEmpty += 1;
      continue;
    }
    const question = row.text.slice(0, MAX_FIELD_CHARS);
    const key = normalizePair(question, answer);
    if (existing.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    existing.add(key);
    pairs.push({ question, answer });
  }

  const { vectors, ok } = await embedQuestions(
    pairs.map((p) => p.question),
    deps,
  );
  const inserted = await libraryRepo.insertMany(
    orgId,
    pairs.map((p, i) => ({ question: p.question, answer: p.answer, source: "import" as const, embedding: vectors[i] })),
  );
  await audit({
    orgId,
    actor: "user",
    type: "library.imported",
    input: { fileName: deps?.fileName ?? null, sheet: resolved.sheetName, rows: rows.length },
    output: { imported: inserted.length, skippedEmpty, skippedDuplicates, embedded: ok },
  });
  return { imported: inserted.length, skippedEmpty, skippedDuplicates, embedded: ok, mapping: resolved };
}

/** A manual library entry (source "manual"), embedded on its question. */
export async function addLibraryAnswer(
  orgId: string,
  input: { question: string; answer: string },
  deps?: ServiceDeps,
): Promise<LibraryAnswerSummary> {
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question || !answer) throw new ServiceError("invalid_input", "Both a question and an answer are needed.");
  if (question.length > MAX_FIELD_CHARS || answer.length > MAX_FIELD_CHARS) {
    throw new ServiceError("invalid_input", `Questions and answers are limited to ${MAX_FIELD_CHARS} characters.`);
  }
  const { vectors } = await embedQuestions([question], deps);
  const [row] = await libraryRepo.insertMany(orgId, [{ question, answer, source: "manual", embedding: vectors[0] }]);
  await audit({ orgId, actor: "user", type: "library.added", entityType: "library_answer", entityId: row.id });
  return row;
}

export type ListLibraryOptions = {
  /** Case-insensitive substring of the question or answer. */
  search?: string;
  source?: LibrarySource;
  limit?: number;
  offset?: number;
};

/** Newest approval first. */
export async function listLibrary(orgId: string, options: ListLibraryOptions = {}): Promise<LibraryAnswerSummary[]> {
  return libraryRepo.listForOrg(orgId, { limit: 500, ...options });
}

export async function deleteLibraryAnswer(orgId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const removed = await libraryRepo.remove(orgId, id);
  if (removed) await audit({ orgId, actor: "user", type: "library.deleted", entityType: "library_answer", entityId: id });
  return removed;
}

/**
 * The whole library as CSV (Pro: spec 2 "answer library export"). Columns:
 * Question, Answer, Source, Approved at. Cells are neutralised against CSV
 * formula injection. Throws PlanLimitError on Free.
 */
export async function exportLibraryCsv(orgId: string): Promise<string> {
  const org = await organizationsRepo.getById(orgId);
  if (!org) throw new NotFoundError("Organization");
  assertProFeature(org, "library_export");
  const rows: LibraryAnswerSummary[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await libraryRepo.listForOrg(orgId, { limit: 1000, offset });
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const data = [
    ["Question", "Answer", "Source", "Approved at"],
    ...rows.map((r) => [r.question, r.answer, r.source, r.approvedAt.toISOString()].map(neutralizeFormula)),
  ];
  return `﻿${Papa.unparse(data, { newline: "\r\n" })}\r\n`;
}
