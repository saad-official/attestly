import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { SheetDetectionError, detectMapping, readQuestions } from "@/lib/sheets/detect";
import { SheetWriteError, writeAnswers } from "@/lib/sheets/writeback";
import {
  CAIQ_QUESTION_COUNT,
  MESSY_HEADER_ROW,
  MESSY_QUESTION_COUNT,
  MESSY_SECTIONS,
  SIG_SECTIONS,
  buildCaiq,
  buildMessy,
  buildSigLite,
  fromBytes,
  toBytes,
} from "@/tests/fixtures/questionnaires";

describe("detectMapping: SIG-Lite style", () => {
  const workbook = buildSigLite();
  const mapping = detectMapping(workbook);

  it("picks the sheet with the most text cells", () => {
    expect(mapping.sheetName).toBe("SIG Lite");
    expect(mapping.warnings.join(" ")).toMatch(/2 sheets/);
  });

  it("finds the header row and classifies the columns by vocabulary", () => {
    expect(mapping.headerRow).toBe(1);
    expect(mapping.columns).toEqual({ id: 1, question: 2, answer: 3, comment: 4 });
    expect(mapping.headers.map((h) => h.label)).toEqual(["Ques Num", "Question/Request", "Response", "Additional Information"]);
    expect(mapping.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detects un-numbered section rows", () => {
    expect(mapping.sections.map((s) => s.label)).toEqual(SIG_SECTIONS.map((s) => s.label));
    expect(mapping.sections[0].row).toBe(2);
  });

  it("reads every question with its id and section", () => {
    const questions = readQuestions(workbook, mapping);
    expect(questions).toHaveLength(12);
    expect(questions[0]).toEqual({
      rowNumber: 3,
      externalId: "A.1",
      text: SIG_SECTIONS[0].questions[0],
      section: "A. Risk Assessment and Treatment",
    });
    expect(questions[11].section).toBe("H. Access Control");
    expect(questions.map((q) => q.text)).not.toContain("B. Security Policy");
  });
});

describe("detectMapping: CAIQ style", () => {
  const workbook = buildCaiq();
  const mapping = detectMapping(workbook);

  it("prefers the Question header over other control text and the question id over the control id", () => {
    expect(mapping.headerRow).toBe(1);
    expect(mapping.columns).toEqual({ id: 1, question: 2, answer: 3, comment: 5 });
    expect(mapping.sections).toEqual([]);
    expect(mapping.warnings).toEqual([]);
  });

  it("reads all questions with control-style ids", () => {
    const questions = readQuestions(workbook, mapping);
    expect(questions).toHaveLength(CAIQ_QUESTION_COUNT);
    expect(questions[0].externalId).toBe("A&A-01.1");
    expect(questions[0].section).toBeUndefined();
    expect(questions.every((q) => q.text.endsWith("?"))).toBe(true);
  });
});

describe("detectMapping: messy workbook", () => {
  const workbook = buildMessy();
  const mapping = detectMapping(workbook);

  it("skips title rows to find the header and maps Vendor Response as the answer", () => {
    expect(mapping.sheetName).toBe("Assessment");
    expect(mapping.headerRow).toBe(MESSY_HEADER_ROW);
    expect(mapping.columns).toEqual({ id: 1, question: 3, answer: 4, comment: 5 });
  });

  it("detects merged all-caps section rows and ignores the trailing note", () => {
    expect(mapping.sections.map((s) => s.label)).toEqual(MESSY_SECTIONS.map((s) => s.label));
  });

  it("reads questions, skipping blank, section and repeated header rows", () => {
    const questions = readQuestions(workbook, mapping);
    expect(questions).toHaveLength(MESSY_QUESTION_COUNT);
    expect(questions.map((q) => q.text)).not.toContain("Requirement");
    expect(questions[0]).toMatchObject({ externalId: "1", text: "Do you have a dedicated security officer?", section: "1. GOVERNANCE" });
    const last = questions[questions.length - 1];
    expect(last).toMatchObject({ externalId: String(MESSY_QUESTION_COUNT), section: "4. BUSINESS CONTINUITY" });
  });
});

describe("detectMapping: fallbacks", () => {
  it("uses content heuristics when no header row exists", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Q");
    for (let i = 1; i <= 6; i++) sheet.addRow([`Q${i}`, `Do you perform security control number ${i} on a regular basis?`, ""]);
    const mapping = detectMapping(workbook);
    expect(mapping.headerRow).toBe(0);
    expect(mapping.columns.question).toBe(2);
    expect(mapping.columns.answer).toBeUndefined();
    expect(mapping.confidence).toBeLessThan(0.6);
    expect(mapping.warnings.join(" ")).toMatch(/no header row/i);
    expect(mapping.warnings.join(" ")).toMatch(/no answer column/i);
    expect(readQuestions(workbook, mapping)).toHaveLength(6);
  });

  it("uses content to choose between two question-like headers", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Q");
    sheet.addRow(["Control", "Description", "Answer"]);
    for (let i = 1; i <= 5; i++) sheet.addRow([`Encryption ${i}`, `Do you encrypt all customer data stored in system ${i}?`, ""]);
    expect(detectMapping(workbook).columns.question).toBe(2);
  });

  it("throws when the workbook has no text at all", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Empty");
    expect(() => detectMapping(workbook)).toThrow(SheetDetectionError);
  });
});

describe("writeAnswers", () => {
  it("writes answers and comments into the mapped cells and round-trips", async () => {
    const original = buildMessy();
    const bytes = await toBytes(original);
    const mapping = detectMapping(await fromBytes(bytes));
    const questions = readQuestions(await fromBytes(bytes), mapping);

    const answers = questions.map((q, i) => ({
      rowNumber: q.rowNumber,
      answer: `Answer ${i + 1}`,
      ...(i === 0 ? { comment: "See Information Security Policy section 2." } : {}),
    }));
    const out = await writeAnswers(bytes, mapping, answers);
    const reread = await fromBytes(out);
    const sheet = reread.getWorksheet("Assessment");
    if (!sheet) throw new Error("sheet missing");

    questions.forEach((q, i) => expect(sheet.getCell(q.rowNumber, 4).value).toBe(`Answer ${i + 1}`));
    expect(sheet.getCell(questions[0].rowNumber, 5).value).toBe("See Information Security Policy section 2.");

    // Everything else is unchanged: titles, merges, header styles, question text, widths.
    expect(sheet.getCell("A1").value).toBe("Globex Corporation - Third-Party Security Questionnaire 2026");
    expect(sheet.getCell("A1").font?.bold).toBe(true);
    expect(sheet.getCell("C1").isMerged).toBe(true);
    expect(sheet.getCell(MESSY_HEADER_ROW, 4).value).toBe("Vendor Response");
    expect(sheet.getCell(MESSY_HEADER_ROW, 4).font?.bold).toBe(true);
    expect(sheet.getCell(MESSY_HEADER_ROW, 4).fill).toEqual(
      original.getWorksheet("Assessment")?.getCell(MESSY_HEADER_ROW, 4).fill,
    );
    expect(sheet.getColumn(3).width).toBe(70);
    expect(readQuestions(reread, mapping).map((q) => q.text)).toEqual(questions.map((q) => q.text));
  });

  it("leaves rows without an answer untouched and keeps other sheets", async () => {
    const bytes = await toBytes(buildSigLite());
    const mapping = detectMapping(await fromBytes(bytes));
    const out = await writeAnswers(bytes, mapping, [{ rowNumber: 3, answer: "Yes. Approved by the CEO." }]);
    const reread = await fromBytes(out);
    const sheet = reread.getWorksheet("SIG Lite");
    expect(sheet?.getCell(3, 3).value).toBe("Yes. Approved by the CEO.");
    expect(sheet?.getCell(4, 3).value).toBeNull();
    expect(reread.getWorksheet("Instructions")?.getCell("A2").value).toBe("Answer each question in the Response column.");
  });

  it("creates an answer column with a header when the mapping has none", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Q");
    const header = sheet.addRow(["#", "Question"]);
    header.font = { bold: true };
    sheet.addRow(["1", "Do you encrypt backups?"]);
    sheet.addRow(["2", "Do you test restores?"]);
    const bytes = await toBytes(workbook);
    const mapping = detectMapping(await fromBytes(bytes));
    expect(mapping.columns.answer).toBeUndefined();

    const out = await writeAnswers(bytes, mapping, [
      { rowNumber: 2, answer: "Yes." },
      { rowNumber: 3, answer: "Yes, quarterly.", comment: "no comment column: ignored" },
    ]);
    const reread = (await fromBytes(out)).getWorksheet("Q");
    expect(reread?.getCell(1, 3).value).toBe("Response");
    expect(reread?.getCell(1, 3).font?.bold).toBe(true);
    expect(reread?.getCell(2, 3).value).toBe("Yes.");
    expect(reread?.getCell(3, 3).value).toBe("Yes, quarterly.");
    expect(reread?.getCell(3, 4).value).toBeNull();
  });

  it("stores formula-looking answers as plain text", async () => {
    const bytes = await toBytes(buildCaiq());
    const mapping = detectMapping(await fromBytes(bytes));
    const out = await writeAnswers(bytes, mapping, [{ rowNumber: 2, answer: "=HYPERLINK(\"http://evil\")" }]);
    const cell = (await fromBytes(out)).getWorksheet("CAIQv4.0.2")?.getCell(2, 3);
    expect(cell?.value).toBe("=HYPERLINK(\"http://evil\")");
    expect(cell?.formula).toBeUndefined();
  });

  it("refuses to overwrite the header or rows above it, and unknown sheets", async () => {
    const bytes = await toBytes(buildMessy());
    const mapping = detectMapping(await fromBytes(bytes));
    await expect(writeAnswers(bytes, mapping, [{ rowNumber: MESSY_HEADER_ROW, answer: "x" }])).rejects.toBeInstanceOf(SheetWriteError);
    await expect(writeAnswers(bytes, { ...mapping, sheetName: "Nope" }, [])).rejects.toBeInstanceOf(SheetWriteError);
  });
});
