/**
 * CSV in and out (spec 3.2 and 3.5).
 *
 * - `csvToWorkbook` loads a CSV into a one-sheet ExcelJS workbook (all values
 *   kept as text) so CSV uploads go through the same detectMapping /
 *   readQuestions path as XLSX. Row numbers equal CSV record numbers.
 * - `writeAnswersCsv` is the CSV round-trip: answers go into the mapped
 *   columns of the original CSV, everything else is re-emitted unchanged.
 * - `exportAnswersCsv` is the always-available flat export.
 *
 * Values Attestly writes are neutralised against CSV formula injection
 * (a leading = + - @ tab or CR gets a ' prefix); original cells are untouched.
 */
import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { SheetMapping } from "@/lib/sheets/detect";
import { ADDED_ANSWER_HEADER, SheetWriteError, type AnswerWrite } from "@/lib/sheets/writeback";

const BOM = String.fromCharCode(0xfeff);

function parseRows(text: string): string[][] {
  const result = Papa.parse<string[]>(text.startsWith(BOM) ? text.slice(1) : text, { skipEmptyLines: false });
  const rows = result.data.map((row) => row.map((v) => v ?? ""));
  while (rows.length > 0 && rows[rows.length - 1].every((v) => v.trim() === "")) rows.pop();
  return rows;
}

export function csvToWorkbook(text: string, sheetName = "CSV"): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  parseRows(text).forEach((values, index) => {
    const row = sheet.getRow(index + 1);
    values.forEach((value, col) => {
      if (value !== "") row.getCell(col + 1).value = value;
    });
  });
  return workbook;
}

export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function setCell(rows: string[][], rowNumber: number, column: number, value: string) {
  while (rows.length < rowNumber) rows.push([]);
  const row = rows[rowNumber - 1];
  while (row.length < column) row.push("");
  row[column - 1] = value;
}

export function writeAnswersCsv(
  originalText: string,
  mapping: Pick<SheetMapping, "headerRow" | "columns">,
  answers: AnswerWrite[],
): string {
  const rows = parseRows(originalText);
  const width = Math.max(0, ...rows.map((r) => r.length));
  let answerColumn = mapping.columns.answer;
  if (answerColumn === undefined) {
    answerColumn = width + 1;
    if (mapping.headerRow > 0) setCell(rows, mapping.headerRow, answerColumn, ADDED_ANSWER_HEADER);
  }
  for (const a of answers) {
    if (a.rowNumber <= mapping.headerRow) throw new SheetWriteError(`Row ${a.rowNumber} is not below the header row ${mapping.headerRow}.`);
    setCell(rows, a.rowNumber, answerColumn, neutralizeFormula(a.answer));
    if (a.comment !== undefined && mapping.columns.comment !== undefined) {
      setCell(rows, a.rowNumber, mapping.columns.comment, neutralizeFormula(a.comment));
    }
  }
  const finalWidth = Math.max(0, ...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...new Array<string>(finalWidth - r.length).fill("")]);
  const newline = originalText.includes("\r\n") ? "\r\n" : "\n";
  const body = Papa.unparse(padded, { newline });
  return `${originalText.startsWith(BOM) ? BOM : ""}${body}${newline}`;
}

export type ExportRow = {
  externalId?: string;
  section?: string;
  question: string;
  answer: string;
  status: string;
  comment?: string;
};

export function exportAnswersCsv(rows: ExportRow[]): string {
  const data = [
    ["ID", "Section", "Question", "Answer", "Status", "Comment"],
    ...rows.map((r) =>
      [r.externalId ?? "", r.section ?? "", r.question, r.answer, r.status, r.comment ?? ""].map(neutralizeFormula),
    ),
  ];
  return `${BOM}${Papa.unparse(data, { newline: "\r\n" })}\r\n`;
}
