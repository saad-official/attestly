/**
 * Questionnaire mapping detection (spec 3.2).
 *
 * 1. Sheet: the one with the most text cells.
 * 2. Header row: the first row (within the first 30) where at least two
 *    short cells match the header vocabulary. 0 means "no header".
 * 3. Columns: each header cell gets its strongest role (an exact phrase match
 *    beats a phrase contained in a longer header; longer phrases beat
 *    shorter ones). The question column is the question-role header with the
 *    best header strength + content score (many cells ending in "?", long
 *    text); without one, the best content score wins with a warning.
 * 4. Sections: rows with a single distinct text that are merged across
 *    columns, short and ALL CAPS, sit outside the question column, or (when
 *    nearly every question has an id) have no id and do not read as a
 *    sentence. Sections with no question after them are dropped.
 *
 * Column numbers are 1-based, as in ExcelJS.
 */
import type ExcelJS from "exceljs";
import { cellText, isHorizontallyMerged } from "@/lib/sheets/cells";

export type ColumnRole = "id" | "question" | "answer" | "comment";

export type SheetColumns = {
  id?: number;
  question: number;
  answer?: number;
  comment?: number;
};

export type SheetMapping = {
  sheetName: string;
  /** 1-based header row, or 0 when the sheet has no recognisable header. */
  headerRow: number;
  columns: SheetColumns;
  sections: Array<{ row: number; label: string }>;
  /** Header labels, for the mapping preview. */
  headers: Array<{ column: number; label: string }>;
  confidence: number;
  warnings: string[];
};

export type QuestionRow = {
  rowNumber: number;
  externalId?: string;
  text: string;
  section?: string;
};

export class SheetDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetDetectionError";
  }
}

type Phrase = { phrase: string; exactOnly?: boolean };

const VOCABULARY: Record<ColumnRole, Phrase[]> = {
  question: ["question", "questions", "question text", "question request", "control question", "requirement", "requirements", "control", "description"].map(
    (phrase) => ({ phrase }),
  ),
  answer: ["answer", "answers", "response", "responses", "vendor response", "supplier response", "your answer", "your response", "yes no", "reply"].map(
    (phrase) => ({ phrase }),
  ),
  comment: [
    "comment",
    "comments",
    "note",
    "notes",
    "evidence",
    "remarks",
    "explanation",
    "justification",
    "additional information",
    "additional comments",
    "implementation description",
  ].map((phrase) => ({ phrase })),
  id: [
    ...["id", "#", "ref", "reference", "control id", "question id", "ref id", "ques num", "question number", "control number"].map((phrase) => ({ phrase })),
    ...["no", "num", "number", "item", "s no", "sr no"].map((phrase) => ({ phrase, exactOnly: true })),
  ],
};

/** Ties between roles resolve in this order. */
const ROLE_PRIORITY: ColumnRole[] = ["id", "answer", "comment", "question"];

const MAX_HEADER_SCAN_ROWS = 30;
const MAX_HEADER_CELL_CHARS = 60;

export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

function phraseStrength(header: string, entry: Phrase): number {
  const words = entry.phrase.split(" ").length;
  if (header === entry.phrase) return 10 + words;
  if (entry.exactOnly) return 0;
  return ` ${header} `.includes(` ${entry.phrase} `) ? words : 0;
}

/** Strongest role a header label matches, or null. */
export function classifyHeader(label: string): { role: ColumnRole; strength: number } | null {
  const header = normalizeHeader(label);
  if (header.length === 0) return null;
  let best: { role: ColumnRole; strength: number } | null = null;
  for (const role of ROLE_PRIORITY) {
    const strength = Math.max(0, ...VOCABULARY[role].map((entry) => phraseStrength(header, entry)));
    if (strength > 0 && (!best || strength > best.strength)) best = { role, strength };
  }
  return best;
}

function isHeaderLike(text: string): boolean {
  return text.length > 0 && text.length <= MAX_HEADER_CELL_CHARS && !text.endsWith("?") && classifyHeader(text) !== null;
}

type RowInfo = {
  row: number;
  /** Distinct non-empty texts, one per merged region. */
  texts: Array<{ col: number; text: string }>;
  banner: boolean;
};

function readRow(sheet: ExcelJS.Worksheet, rowNumber: number): RowInfo {
  const texts: Array<{ col: number; text: string }> = [];
  const seenMasters = new Set<string>();
  let banner = false;
  const row = sheet.getRow(rowNumber);
  for (let col = 1; col <= sheet.columnCount; col++) {
    const cell = row.getCell(col);
    if (cell.isMerged) {
      if (seenMasters.has(cell.master.address)) continue;
      seenMasters.add(cell.master.address);
      if (cell.master.fullAddress.row !== rowNumber) continue; // vertical merge from above
      if (isHorizontallyMerged(cell, sheet)) banner = true;
    }
    const text = cellText(cell.isMerged ? cell.master : cell);
    if (text.length > 0) texts.push({ col, text });
  }
  return { row: rowNumber, texts, banner: banner && texts.length === 1 };
}

function countTextCells(sheet: ExcelJS.Worksheet): number {
  let count = 0;
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      if (/\p{L}/u.test(cellText(cell))) count += 1;
    });
  });
  return count;
}

function textOf(info: RowInfo, col: number | undefined): string {
  if (col === undefined) return "";
  return info.texts.find((t) => t.col === col)?.text ?? "";
}

type ColumnStats = { nonEmpty: number; avgLength: number; questionMarkRatio: number; content: number };

function columnStats(rows: RowInfo[], col: number): ColumnStats {
  const values = rows.filter((r) => !r.banner).map((r) => textOf(r, col)).filter((t) => t.length > 0);
  if (values.length === 0) return { nonEmpty: 0, avgLength: 0, questionMarkRatio: 0, content: 0 };
  const avgLength = values.reduce((sum, v) => sum + v.length, 0) / values.length;
  const questionMarkRatio = values.filter((v) => v.endsWith("?")).length / values.length;
  return { nonEmpty: values.length, avgLength, questionMarkRatio, content: 0.6 * questionMarkRatio + 0.4 * Math.min(avgLength / 120, 1) };
}

function isAllCapsLabel(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return text.length <= 80 && letters.length >= 3 && letters === letters.toUpperCase();
}

function pickSheet(workbook: ExcelJS.Workbook, warnings: string[]): ExcelJS.Worksheet {
  const counted = workbook.worksheets.map((sheet) => ({ sheet, count: countTextCells(sheet) }));
  const withText = counted.filter((c) => c.count > 0);
  if (withText.length === 0) throw new SheetDetectionError("The workbook has no text cells.");
  const best = withText.reduce((a, b) => (b.count > a.count ? b : a));
  if (withText.length > 1) {
    warnings.push(`Using sheet "${best.sheet.name}" (most text cells of ${withText.length} sheets).`);
  }
  return best.sheet;
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  const last = Math.min(sheet.rowCount, MAX_HEADER_SCAN_ROWS);
  for (let r = 1; r <= last; r++) {
    const info = readRow(sheet, r);
    if (info.texts.filter((t) => isHeaderLike(t.text)).length >= 2) return r;
  }
  return 0;
}

function idLike(values: string[]): boolean {
  if (values.length === 0) return false;
  const unique = new Set(values).size / values.length;
  return unique >= 0.9 && values.every((v) => v.length <= 16 && /\d/.test(v));
}

export function detectMapping(workbook: ExcelJS.Workbook): SheetMapping {
  const warnings: string[] = [];
  const sheet = pickSheet(workbook, warnings);
  const headerRow = findHeaderRow(sheet);

  const headers: Array<{ column: number; label: string }> = [];
  const roleOf = new Map<number, { role: ColumnRole; strength: number }>();
  if (headerRow > 0) {
    for (const { col, text } of readRow(sheet, headerRow).texts) {
      headers.push({ column: col, label: text });
      const role = classifyHeader(text);
      if (role && text.length <= MAX_HEADER_CELL_CHARS) roleOf.set(col, role);
    }
  } else {
    warnings.push("No header row detected; columns were inferred from cell contents.");
  }

  const dataRows: RowInfo[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const info = readRow(sheet, r);
    if (info.texts.length > 0) dataRows.push(info);
  }
  const stats = new Map<number, ColumnStats>();
  for (let col = 1; col <= sheet.columnCount; col++) stats.set(col, columnStats(dataRows, col));
  const statOf = (col: number) => stats.get(col) ?? { nonEmpty: 0, avgLength: 0, questionMarkRatio: 0, content: 0 };

  const bestByRole = (role: ColumnRole, exclude: Set<number>): number | undefined => {
    let best: { col: number; score: number } | undefined;
    for (const [col, r] of roleOf) {
      if (r.role !== role || exclude.has(col)) continue;
      const score = role === "question" ? r.strength + 5 * statOf(col).content : r.strength;
      if (!best || score > best.score) best = { col, score };
    }
    return best?.col;
  };

  const used = new Set<number>();
  let questionFromHeader = true;
  let question = bestByRole("question", used);
  if (question === undefined) {
    questionFromHeader = false;
    const assigned = new Set([...roleOf].filter(([, r]) => r.role !== "question").map(([col]) => col));
    const maxNonEmpty = Math.max(1, ...[...stats.values()].map((s) => s.nonEmpty));
    let best: { col: number; score: number } | undefined;
    for (const [col, s] of stats) {
      if (assigned.has(col) || s.nonEmpty === 0) continue;
      const score = s.content + 0.2 * (s.nonEmpty / maxNonEmpty);
      if (!best || score > best.score) best = { col, score };
    }
    if (!best) throw new SheetDetectionError(`Could not find a question column in "${sheet.name}".`);
    question = best.col;
    if (headerRow > 0) warnings.push("No question header matched; the question column was chosen from cell contents.");
  }
  used.add(question);

  const answer = bestByRole("answer", used);
  if (answer !== undefined) used.add(answer);
  else warnings.push('No answer column detected; write-back will add a "Response" column.');
  const comment = bestByRole("comment", used);
  if (comment !== undefined) used.add(comment);
  let id = bestByRole("id", used);

  const questionRows = dataRows.filter((r) => !r.banner && textOf(r, question).length > 0);
  if (id === undefined) {
    for (let col = 1; col < question; col++) {
      if (used.has(col) || roleOf.has(col)) continue;
      const values = questionRows.map((r) => textOf(r, col));
      const filled = values.filter((v) => v.length > 0);
      if (filled.length >= 0.8 * questionRows.length && idLike(filled)) {
        id = col;
        break;
      }
    }
  }

  const columns: SheetColumns = {
    ...(id !== undefined ? { id } : {}),
    question,
    ...(answer !== undefined ? { answer } : {}),
    ...(comment !== undefined ? { comment } : {}),
  };

  // Sections.
  const multiTextQuestionRows = questionRows.filter((r) => r.texts.length >= 2);
  const idCoverage =
    id === undefined || multiTextQuestionRows.length === 0
      ? 0
      : multiTextQuestionRows.filter((r) => textOf(r, id).length > 0).length / multiTextQuestionRows.length;
  const questionHeader = headerRow > 0 ? normalizeHeader(textOf(readRow(sheet, headerRow), question)) : "";

  const candidates: Array<{ row: number; label: string }> = [];
  const isQuestionRow = new Set<number>();
  for (const info of dataRows) {
    const qText = textOf(info, question);
    if (isRepeatedHeader(qText, questionHeader)) continue;
    if (info.texts.length === 1) {
      const { col, text } = info.texts[0];
      const outsideQuestion = col !== question && col !== answer && col !== comment && (text.match(/\p{L}/gu)?.length ?? 0) >= 3;
      const unnumberedHeading =
        idCoverage >= 0.8 && col === question && text.length <= 80 && !/[?.:]$/.test(text);
      if (info.banner || isAllCapsLabel(text) || outsideQuestion || unnumberedHeading) {
        candidates.push({ row: info.row, label: text });
        continue;
      }
    }
    if (qText.length > 0 && !info.banner) isQuestionRow.add(info.row);
  }
  const sections = candidates.filter((s, i) => {
    const nextRow = candidates[i + 1]?.row ?? Number.POSITIVE_INFINITY;
    return [...isQuestionRow].some((r) => r > s.row && r < nextRow);
  });

  // Confidence.
  const qStats = statOf(question);
  let confidence = 0;
  if (headerRow > 0) confidence += 0.3;
  confidence += questionFromHeader ? 0.3 : 0.1;
  if (answer !== undefined) confidence += 0.2;
  if (qStats.questionMarkRatio >= 0.3 || qStats.avgLength >= 30) confidence += 0.2;

  return {
    sheetName: sheet.name,
    headerRow,
    columns,
    sections,
    headers,
    confidence: Math.round(Math.min(1, confidence) * 100) / 100,
    warnings,
  };
}

function isRepeatedHeader(text: string, questionHeader: string): boolean {
  if (text.length === 0) return false;
  const normalized = normalizeHeader(text);
  if (questionHeader.length > 0 && normalized === questionHeader) return true;
  return VOCABULARY.question.some((entry) => entry.phrase === normalized);
}

export function readQuestions(workbook: ExcelJS.Workbook, mapping: SheetMapping): QuestionRow[] {
  const sheet = workbook.getWorksheet(mapping.sheetName);
  if (!sheet) throw new SheetDetectionError(`Sheet "${mapping.sheetName}" not found.`);
  const sectionAt = new Map(mapping.sections.map((s) => [s.row, s.label]));
  const questionHeader =
    mapping.headerRow > 0 ? normalizeHeader(textOf(readRow(sheet, mapping.headerRow), mapping.columns.question)) : "";

  const out: QuestionRow[] = [];
  let section: string | undefined;
  for (let r = mapping.headerRow + 1; r <= sheet.rowCount; r++) {
    const sectionLabel = sectionAt.get(r);
    if (sectionLabel !== undefined) {
      section = sectionLabel;
      continue;
    }
    const info = readRow(sheet, r);
    if (info.banner) continue;
    const text = textOf(info, mapping.columns.question);
    if ((text.match(/\p{L}/gu)?.length ?? 0) < 2) continue;
    if (isRepeatedHeader(text, questionHeader)) continue;
    const externalId = textOf(info, mapping.columns.id);
    out.push({
      rowNumber: r,
      ...(externalId ? { externalId } : {}),
      text,
      ...(section !== undefined ? { section } : {}),
    });
  }
  return out;
}
