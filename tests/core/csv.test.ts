import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { csvToWorkbook, exportAnswersCsv, writeAnswersCsv } from "@/lib/sheets/csv";
import { detectMapping, readQuestions } from "@/lib/sheets/detect";

const BOM = String.fromCharCode(0xfeff);

const SAMPLE = [
  `${BOM}ID,Question,Answer,Comments`,
  'AC-1,"Do you enforce MFA on all systems, including email?",,',
  'AC-2,"Are access rights reviewed quarterly?\nInclude the owner.",,',
  ",,,",
  'DP-1,Is customer data encrypted at rest?,-,"Legacy note"',
  "",
].join("\r\n");

const parse = (text: string) => Papa.parse<string[]>(text.replace(BOM, ""), { skipEmptyLines: false }).data;

describe("csvToWorkbook", () => {
  it("loads CSV rows into a sheet so detection and reading work as for XLSX", () => {
    const workbook = csvToWorkbook(SAMPLE);
    const mapping = detectMapping(workbook);
    expect(mapping.headerRow).toBe(1);
    expect(mapping.columns).toEqual({ id: 1, question: 2, answer: 3, comment: 4 });
    const questions = readQuestions(workbook, mapping);
    expect(questions.map((q) => [q.rowNumber, q.externalId])).toEqual([
      [2, "AC-1"],
      [3, "AC-2"],
      [5, "DP-1"],
    ]);
    expect(questions[0].text).toBe("Do you enforce MFA on all systems, including email?");
    expect(questions[1].text).toBe("Are access rights reviewed quarterly?\nInclude the owner.");
  });

  it("keeps values as text (no number or date coercion)", () => {
    const workbook = csvToWorkbook("id,question\n007,Is 1/2 of data replicated?\n");
    expect(workbook.worksheets[0].getCell(2, 1).value).toBe("007");
  });
});

describe("writeAnswersCsv", () => {
  it("writes answers and comments into mapped columns and keeps everything else", () => {
    const mapping = detectMapping(csvToWorkbook(SAMPLE));
    const out = writeAnswersCsv(SAMPLE, mapping, [
      { rowNumber: 2, answer: "Yes. MFA is enforced everywhere.", comment: "Access Control Policy 3.1" },
      { rowNumber: 5, answer: "Yes, AES-256." },
    ]);
    expect(out.startsWith(BOM)).toBe(true);
    expect(out).toContain("\r\n");
    const rows = parse(out);
    expect(rows[0]).toEqual(["ID", "Question", "Answer", "Comments"]);
    expect(rows[1]).toEqual(["AC-1", "Do you enforce MFA on all systems, including email?", "Yes. MFA is enforced everywhere.", "Access Control Policy 3.1"]);
    expect(rows[2][2]).toBe("");
    expect(rows[4]).toEqual(["DP-1", "Is customer data encrypted at rest?", "Yes, AES-256.", "Legacy note"]);
  });

  it("adds a Response column when there is no answer column", () => {
    const csv = "Ref,Question\n1,Do you back up daily?\n2,Do you test restores?\n";
    const mapping = detectMapping(csvToWorkbook(csv));
    const rows = parse(writeAnswersCsv(csv, mapping, [{ rowNumber: 3, answer: "Yes." }]));
    expect(rows[0]).toEqual(["Ref", "Question", "Response"]);
    expect(rows[1]).toEqual(["1", "Do you back up daily?", ""]);
    expect(rows[2]).toEqual(["2", "Do you test restores?", "Yes."]);
  });

  it("neutralises formula-looking answers it writes", () => {
    const csv = "Ref,Question,Answer\n1,Do you back up daily?,\n";
    const mapping = detectMapping(csvToWorkbook(csv));
    const rows = parse(writeAnswersCsv(csv, mapping, [{ rowNumber: 2, answer: "=cmd|' /C calc'!A0" }]));
    expect(rows[1][2]).toBe("'=cmd|' /C calc'!A0");
  });
});

describe("exportAnswersCsv", () => {
  it("exports a header and one row per question with a BOM for Excel", () => {
    const out = exportAnswersCsv([
      { externalId: "A.1", section: "Access", question: "Do you enforce MFA?", answer: 'Yes. "MFA" everywhere, always.', status: "approved" },
      { question: "Do you have a HIPAA BAA?", answer: "", status: "needs_evidence", comment: "Needs a policy" },
      { question: "Formula?", answer: "+1 555 0100", status: "drafted" },
    ]);
    expect(out.startsWith(BOM)).toBe(true);
    const rows = parse(out);
    expect(rows[0]).toEqual(["ID", "Section", "Question", "Answer", "Status", "Comment"]);
    expect(rows[1]).toEqual(["A.1", "Access", "Do you enforce MFA?", 'Yes. "MFA" everywhere, always.', "approved", ""]);
    expect(rows[2]).toEqual(["", "", "Do you have a HIPAA BAA?", "", "needs_evidence", "Needs a policy"]);
    expect(rows[3][3]).toBe("'+1 555 0100");
  });
});
