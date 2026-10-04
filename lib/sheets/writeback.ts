/**
 * XLSX round-trip export (spec 3.5): load the customer's original workbook,
 * write each answer into the mapped answer cell (and the comment cell when a
 * comment column is mapped), and return new bytes. Values are set on existing
 * cells, so their styles, every other cell, merges, column widths and other
 * sheets come through unchanged, within what ExcelJS round-trips (it drops
 * charts, pivot tables and some drawing objects).
 */
import { loadWorkbook, workbookToBytes } from "@/lib/sheets/cells";
import type { SheetMapping } from "@/lib/sheets/detect";

export type AnswerWrite = {
  rowNumber: number;
  answer: string;
  comment?: string;
};

export class SheetWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetWriteError";
  }
}

export const ADDED_ANSWER_HEADER = "Response";

export async function writeAnswers(
  originalBytes: Uint8Array,
  mapping: Pick<SheetMapping, "sheetName" | "headerRow" | "columns">,
  answers: AnswerWrite[],
): Promise<Uint8Array> {
  const workbook = await loadWorkbook(originalBytes);
  const sheet = workbook.getWorksheet(mapping.sheetName);
  if (!sheet) throw new SheetWriteError(`Sheet "${mapping.sheetName}" is not in the workbook.`);

  for (const a of answers) {
    if (!Number.isInteger(a.rowNumber) || a.rowNumber <= mapping.headerRow) {
      throw new SheetWriteError(`Row ${a.rowNumber} is not below the header row ${mapping.headerRow}.`);
    }
  }

  let answerColumn = mapping.columns.answer;
  if (answerColumn === undefined) {
    answerColumn = sheet.columnCount + 1;
    if (mapping.headerRow > 0) {
      const source = sheet.getCell(mapping.headerRow, mapping.columns.question);
      const header = sheet.getCell(mapping.headerRow, answerColumn);
      header.value = ADDED_ANSWER_HEADER;
      header.style = JSON.parse(JSON.stringify(source.style ?? {}));
    }
    const column = sheet.getColumn(answerColumn);
    if (!column.width) column.width = 50;
  }

  for (const a of answers) {
    const target = sheet.getCell(a.rowNumber, answerColumn);
    // Strings are stored as shared strings, never as formulas, so "=..." stays text.
    (target.isMerged ? target.master : target).value = a.answer;
    if (a.comment !== undefined && mapping.columns.comment !== undefined) {
      const commentCell = sheet.getCell(a.rowNumber, mapping.columns.comment);
      (commentCell.isMerged ? commentCell.master : commentCell).value = a.comment;
    }
  }

  return workbookToBytes(workbook);
}
