import "server-only";
import type ExcelJS from "exceljs";
import { cellText, loadWorkbook, workbookToBytes } from "@/lib/sheets/cells";
import { csvToWorkbook } from "@/lib/sheets/csv";
import { SheetDetectionError, detectMapping, type SheetColumns, type SheetMapping } from "@/lib/sheets/detect";
import { ServiceError } from "./errors";
import { MAX_UPLOAD_BYTES } from "./plan-limits";

/**
 * Spreadsheet plumbing shared by the questionnaire and library services:
 * XLSX-or-CSV detection, loading, and merging a user-edited mapping with the
 * detected one.
 */

export type SpreadsheetFormat = "xlsx" | "csv";

/** CSV uploads are loaded into a one-sheet workbook with this sheet name (lib/sheets/csv). */
export const CSV_SHEET_NAME = "CSV";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_MIME = "text/csv";

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * XLSX (by content: a zip container) or CSV (by name or MIME type). Legacy
 * .xls and anything else is rejected.
 */
export function spreadsheetFormat(bytes: Uint8Array, fileName = "", mimeType = ""): SpreadsheetFormat {
  if (isZip(bytes)) return "xlsx";
  const name = fileName.toLowerCase();
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  // Windows browsers send CSV files as application/vnd.ms-excel, so the name decides.
  if (name.endsWith(".xls") || (mime === "application/vnd.ms-excel" && !name.endsWith(".csv"))) {
    throw new ServiceError("unsupported_file", "Legacy .xls files are not supported. Save the workbook as .xlsx or CSV.");
  }
  if (name.endsWith(".csv") || mime === "text/csv" || mime === "application/csv" || mime === "text/plain" || !name) {
    return "csv";
  }
  if (name.endsWith(".xlsx")) throw new ServiceError("unsupported_file", `${fileName} is not a valid XLSX workbook.`);
  throw new ServiceError("unsupported_file", `Upload an XLSX or CSV file (got ${fileName || mimeType || "unknown"}).`);
}

export function assertUploadSize(bytes: Uint8Array, fileName: string): void {
  if (bytes.byteLength === 0) throw new ServiceError("invalid_input", `${fileName || "The file"} is empty.`);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ServiceError("too_large", `${fileName || "The file"} is larger than 10 MB.`);
}

export function decodeCsv(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

export async function loadSpreadsheet(bytes: Uint8Array, format: SpreadsheetFormat): Promise<ExcelJS.Workbook> {
  if (format === "csv") return csvToWorkbook(decodeCsv(bytes), CSV_SHEET_NAME);
  try {
    return await loadWorkbook(bytes);
  } catch (error) {
    throw new ServiceError("unsupported_file", "The workbook could not be opened. Is it a valid .xlsx file?", { cause: error });
  }
}

/** XLSX bytes for either format (CSV originals are converted, for XLSX export). */
export async function spreadsheetToXlsxBytes(bytes: Uint8Array, format: SpreadsheetFormat): Promise<Uint8Array> {
  return format === "xlsx" ? bytes : workbookToBytes(csvToWorkbook(decodeCsv(bytes), CSV_SHEET_NAME));
}

export function detect(workbook: ExcelJS.Workbook): SheetMapping {
  try {
    return detectMapping(workbook);
  } catch (error) {
    if (error instanceof SheetDetectionError) throw new ServiceError("invalid_input", error.message, { cause: error });
    throw error;
  }
}

/** What a user may change in the mapping preview. Anything left out comes from detection. */
export type MappingInput = {
  sheetName?: string;
  /** 1-based; 0 = the sheet has no header row. */
  headerRow?: number;
  columns: SheetColumns;
  sections?: SheetMapping["sections"];
};

function checkColumn(name: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 1 || value > 16384) {
    throw new ServiceError("invalid_input", `The ${name} column is not valid.`);
  }
}

/**
 * Merges a user-edited mapping over the detected one. Sections are kept from
 * detection only when the sheet and header row are unchanged.
 */
export function resolveMapping(
  workbook: ExcelJS.Workbook,
  input: MappingInput | SheetMapping | undefined,
): SheetMapping {
  const detected = detect(workbook);
  if (!input) return detected;
  const sheetName = input.sheetName ?? detected.sheetName;
  if (!workbook.getWorksheet(sheetName)) throw new ServiceError("invalid_input", `Sheet "${sheetName}" is not in the workbook.`);
  const headerRow = input.headerRow ?? (sheetName === detected.sheetName ? detected.headerRow : 0);
  if (!Number.isInteger(headerRow) || headerRow < 0) throw new ServiceError("invalid_input", "The header row is not valid.");
  const { columns } = input;
  if (!columns || columns.question === undefined) throw new ServiceError("invalid_input", "Choose the question column.");
  checkColumn("question", columns.question);
  checkColumn("answer", columns.answer);
  checkColumn("comment", columns.comment);
  checkColumn("id", columns.id);
  const used = [columns.question, columns.answer, columns.comment, columns.id].filter((c) => c !== undefined);
  if (new Set(used).size !== used.length) throw new ServiceError("invalid_input", "Each column can have only one role.");

  const sameLayout = sheetName === detected.sheetName && headerRow === detected.headerRow;
  return {
    ...detected,
    sheetName,
    headerRow,
    columns: {
      question: columns.question,
      ...(columns.answer !== undefined ? { answer: columns.answer } : {}),
      ...(columns.comment !== undefined ? { comment: columns.comment } : {}),
      ...(columns.id !== undefined ? { id: columns.id } : {}),
    },
    sections: input.sections ?? (sameLayout ? detected.sections : []),
  };
}

/** Text of one cell (merged cells read from their master). */
export function readCell(workbook: ExcelJS.Workbook, sheetName: string, row: number, col: number): string {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return "";
  const cell = sheet.getCell(row, col);
  return cellText(cell.isMerged ? cell.master : cell);
}
