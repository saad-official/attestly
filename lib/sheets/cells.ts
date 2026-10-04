/**
 * Small ExcelJS helpers shared by detection, reading and write-back.
 */
import ExcelJS from "exceljs";

/** Plain text of a cell value: rich text joined, formulas by result, errors and empties as "". */
export function cellText(cell: ExcelJS.Cell): string {
  return valueText(cell.value).trim();
}

function valueText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("hyperlink" in value) return value.text;
  if ("error" in value) return "";
  if ("result" in value) {
    const result = value.result;
    if (result === undefined || (typeof result === "object" && !(result instanceof Date))) return "";
    return valueText(result);
  }
  return "";
}

/** True when the cell belongs to a merge that spans more than one column. */
export function isHorizontallyMerged(cell: ExcelJS.Cell, sheet: ExcelJS.Worksheet): boolean {
  if (!cell.isMerged) return false;
  // ExcelJS types Address.row/col as strings; fullAddress carries the numbers.
  const { row, col } = cell.fullAddress;
  const master = cell.master;
  if (master.fullAddress.col !== col) return true;
  const right = col < sheet.columnCount ? sheet.getCell(row, col + 1) : null;
  return Boolean(right?.isMerged && right.master.address === master.address);
}

export async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types its input as an ArrayBuffer-like "Buffer"; copy to a plain ArrayBuffer.
  await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  return workbook;
}

export async function workbookToBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
