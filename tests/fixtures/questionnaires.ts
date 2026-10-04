/**
 * Synthetic questionnaire workbooks, generated with ExcelJS so tests need no
 * binary fixtures. Shapes mimic what customers actually send.
 */
import ExcelJS from "exceljs";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
}

export async function toBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function fromBytes(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  return workbook;
}

// ---------------------------------------------------------------------------
// SIG-Lite style: an instructions sheet, then numbered questions grouped under
// section rows written in the question column with no number.

export const SIG_SECTIONS = [
  {
    label: "A. Risk Assessment and Treatment",
    questions: [
      "Is there a risk assessment program that has been approved by management?",
      "Does the risk assessment program include a formal risk register?",
      "Are risk assessments performed at least annually?",
      "Is there a process to track remediation of identified risks?",
    ],
  },
  {
    label: "B. Security Policy",
    questions: [
      "Is there an information security policy approved by management?",
      "Has the policy been communicated to all employees?",
      "Is the policy reviewed at least annually?",
      "Describe the owner responsible for maintaining the security policy.",
    ],
  },
  {
    label: "H. Access Control",
    questions: [
      "Is multi-factor authentication required for remote access?",
      "Are user access rights reviewed periodically?",
      "Are shared or generic accounts prohibited?",
      "Is access revoked within 24 hours of termination?",
    ],
  },
] as const;

export function buildSigLite(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const intro = workbook.addWorksheet("Instructions");
  intro.getCell("A1").value = "Standardized Information Gathering (Lite) - synthetic sample";
  intro.getCell("A2").value = "Answer each question in the Response column.";
  intro.getCell("A3").value = "Use Additional Information for context or evidence references.";

  const sheet = workbook.addWorksheet("SIG Lite");
  sheet.columns = [{ width: 10 }, { width: 70 }, { width: 18 }, { width: 40 }];
  styleHeader(sheet.addRow(["Ques Num", "Question/Request", "Response", "Additional Information"]));
  SIG_SECTIONS.forEach((section, s) => {
    if (s > 0) sheet.addRow([]);
    const sectionRow = sheet.addRow([null, section.label]);
    sectionRow.font = { bold: true };
    section.questions.forEach((q, i) => {
      const row = sheet.addRow([`${section.label[0]}.${i + 1}`, q]);
      row.getCell(2).alignment = { wrapText: true };
    });
  });
  return workbook;
}

// ---------------------------------------------------------------------------
// CAIQ style: one flat sheet with question ids, a CCM control id column and
// long control specifications, no section rows.

const CAIQ_DOMAINS = [
  ["A&A", "Audit & Assurance"],
  ["AIS", "Application & Interface Security"],
  ["BCR", "Business Continuity Management and Operational Resilience"],
  ["CEK", "Cryptography, Encryption & Key Management"],
  ["IAM", "Identity & Access Management"],
] as const;

export const CAIQ_QUESTION_COUNT = 15;

export function buildCaiq(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("CAIQv4.0.2");
  styleHeader(
    sheet.addRow([
      "Question ID",
      "Question",
      "CSP CAIQ Answer",
      "SSRM Control Ownership",
      "CSP Implementation Description (Optional/Recommended)",
      "CCM Control ID",
      "CCM Control Specification",
      "CCM Domain Title",
    ]),
  );
  let n = 0;
  for (const [code, domain] of CAIQ_DOMAINS) {
    for (let i = 1; i <= 3; i++) {
      n += 1;
      sheet.addRow([
        `${code}-0${i}.1`,
        `Are ${domain.toLowerCase()} policies and procedures established, documented, approved, communicated, applied, evaluated and maintained (control ${n})?`,
        null,
        "CSP-owned",
        null,
        `${code}-0${i}`,
        `Establish, document, approve, communicate, apply, evaluate and maintain ${domain.toLowerCase()} policies and procedures. Review and update the policies and procedures at least annually so that they remain effective for the organization.`,
        domain,
      ]);
    }
  }
  return workbook;
}

// ---------------------------------------------------------------------------
// Messy: title and instruction rows above the header, merged all-caps section
// rows, a repeated header mid-sheet, a trailing note, "Vendor Response".

export const MESSY_SECTIONS = [
  {
    label: "1. GOVERNANCE",
    questions: [
      "Do you have a dedicated security officer?",
      "Describe how security responsibilities are assigned.",
      "Is security training mandatory for all staff?",
    ],
  },
  {
    label: "2. DATA PROTECTION",
    questions: [
      "Is customer data encrypted at rest?",
      "Is customer data encrypted in transit?",
      "Provide the regions where customer data is stored.",
      "How long is customer data retained after contract termination?",
    ],
  },
  {
    label: "3. INCIDENT MANAGEMENT",
    questions: [
      "Do you have a documented incident response plan?",
      "Within how many hours will you notify us of a breach?",
      "Has the plan been tested in the last 12 months?",
    ],
  },
  {
    label: "4. BUSINESS CONTINUITY",
    questions: [
      "Are backups taken daily?",
      "Is disaster recovery tested at least annually?",
      "What are your RPO and RTO targets?",
      "Do you have redundant infrastructure across availability zones?",
    ],
  },
] as const;

export const MESSY_QUESTION_COUNT = MESSY_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
export const MESSY_HEADER_ROW = 4;

export function buildMessy(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Assessment");
  sheet.columns = [{ width: 6 }, { width: 18 }, { width: 70 }, { width: 30 }, { width: 30 }];

  sheet.getCell("A1").value = "Globex Corporation - Third-Party Security Questionnaire 2026";
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.mergeCells("A1:E1");
  sheet.getCell("A2").value = "Please answer every requirement and return this workbook to vendor-risk@globex.example within 10 business days.";
  sheet.mergeCells("A2:E2");
  // Row 3 left blank.
  const header = ["No.", "Domain", "Requirement", "Vendor Response", "Evidence / Notes"];
  sheet.getRow(MESSY_HEADER_ROW).values = header;
  styleHeader(sheet.getRow(MESSY_HEADER_ROW));

  let rowNumber = MESSY_HEADER_ROW;
  let questionNumber = 0;
  MESSY_SECTIONS.forEach((section, s) => {
    if (s === 2) {
      // A page-break style repeated header.
      rowNumber += 1;
      sheet.getRow(rowNumber).values = header;
    }
    rowNumber += 1;
    sheet.getCell(rowNumber, 1).value = section.label;
    sheet.getCell(rowNumber, 1).font = { bold: true };
    sheet.mergeCells(rowNumber, 1, rowNumber, 5);
    const domain = section.label.replace(/^\d+\.\s*/, "").toLowerCase();
    section.questions.forEach((q) => {
      rowNumber += 1;
      questionNumber += 1;
      sheet.getRow(rowNumber).values = [questionNumber, domain, q];
    });
    rowNumber += 1; // blank spacer row
  });
  rowNumber += 1;
  sheet.getCell(rowNumber, 1).value = "End of questionnaire - thank you.";
  sheet.mergeCells(rowNumber, 1, rowNumber, 5);
  return workbook;
}
