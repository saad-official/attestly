/**
 * The demo "Acme Corp vendor security questionnaire" (spec 3.7): 40 questions
 * in seven sections, generated as an XLSX with ExcelJS. About 30 are
 * answerable from the demo policies, 6 are deliberately not covered (they
 * should come back as needs_evidence) and 4 do not apply to a SaaS company
 * that hosts on AWS (they should come back as not_applicable).
 *
 * `evidence` is a regex that the policies must match for answerable and
 * not-applicable questions; `absentTerms` must not appear anywhere in the
 * policies or the library for not-covered ones. Both are checked in tests.
 */
import ExcelJS from "exceljs";
import { workbookToBytes } from "@/lib/sheets/cells";

export const DEMO_CUSTOMER = "Acme Corp";
export const DEMO_QUESTIONNAIRE_NAME = "Acme Corp vendor security questionnaire";
export const DEMO_QUESTIONNAIRE_FILE_NAME = "acme-corp-vendor-security-questionnaire.xlsx";

export const DEMO_SECTIONS = [
  "Organisation",
  "Access Control",
  "Data Protection",
  "Incident Management",
  "Business Continuity",
  "Vendor Management",
  "Development",
] as const;

export type DemoSection = (typeof DEMO_SECTIONS)[number];
export type DemoExpectation = "answerable" | "not_covered" | "not_applicable";

export type DemoQuestion = {
  ref: string;
  section: DemoSection;
  text: string;
  expected: DemoExpectation;
  evidence?: string;
  absentTerms?: string[];
};

const answerable = (ref: string, section: DemoSection, text: string, evidence: string): DemoQuestion => ({
  ref,
  section,
  text,
  expected: "answerable",
  evidence,
});
const notApplicable = (ref: string, section: DemoSection, text: string, evidence: string): DemoQuestion => ({
  ref,
  section,
  text,
  expected: "not_applicable",
  evidence,
});
const notCovered = (ref: string, section: DemoSection, text: string, absentTerms: string[]): DemoQuestion => ({
  ref,
  section,
  text,
  expected: "not_covered",
  absentTerms,
});

export const DEMO_QUESTIONS: DemoQuestion[] = [
  answerable("ORG-01", "Organisation", "Do you have a documented information security policy approved by management?", "Approved by the Chief Technology Officer"),
  answerable("ORG-02", "Organisation", "How often are your security policies reviewed and updated?", "reviewed at least annually"),
  answerable("ORG-03", "Organisation", "Who is responsible for information security in your organisation?", "Head of Security is responsible"),
  answerable("ORG-04", "Organisation", "Do you perform background checks on employees before they join?", "Background checks are performed on all employees"),
  answerable("ORG-05", "Organisation", "Is security awareness training mandatory for all employees, and how often is it repeated?", "training is mandatory for all staff"),
  answerable("ORG-06", "Organisation", "Do you have an independent audit report such as a SOC 2 Type II?", "SOC 2 Type II audit is planned"),
  notCovered("ORG-07", "Organisation", "Are you certified to ISO/IEC 27001? Please provide the certificate.", ["27001"]),
  notCovered("ORG-08", "Organisation", "What are the coverage limits of your cyber insurance policy?", ["insurance"]),

  answerable("AC-01", "Access Control", "Is multi-factor authentication enforced for all users and systems?", "MFA\\) is enforced on all systems"),
  answerable("AC-02", "Access Control", "How frequently are user access rights reviewed?", "Access rights are reviewed quarterly"),
  answerable("AC-03", "Access Control", "How quickly is access revoked when an employee or contractor leaves?", "revoked within 24 hours of termination"),
  answerable("AC-04", "Access Control", "Is access to production systems restricted on a least-privilege basis?", "least privilege"),
  answerable("AC-05", "Access Control", "Are company laptops protected with full-disk encryption?", "full-disk encryption"),
  notCovered("AC-06", "Access Control", "Do you retain physical office badge access logs, and for how long?", ["badge"]),

  answerable("DP-01", "Data Protection", "Is customer data encrypted at rest? Which algorithm is used?", "encrypted at rest with AES-256"),
  answerable("DP-02", "Data Protection", "Is customer data encrypted in transit?", "TLS 1\\.2 or higher"),
  answerable("DP-03", "Data Protection", "In which region(s) is customer data hosted?", "eu-west-1 \\(Ireland\\)"),
  answerable("DP-04", "Data Protection", "How long do you retain customer data after contract termination?", "Deleted within 30 days of contract termination"),
  answerable("DP-05", "Data Protection", "How long are system and security logs retained?", "Logs are retained for 90 days"),
  notApplicable(
    "DP-06",
    "Data Protection",
    "Do you store or process payment cardholder data? If so, provide your PCI DSS Attestation of Compliance.",
    "does not store, process or transmit payment cardholder data",
  ),
  notCovered("DP-07", "Data Protection", "Will you sign a HIPAA Business Associate Agreement?", ["HIPAA", "business associate"]),
  notCovered("DP-08", "Data Protection", "Is a data loss prevention (DLP) tool deployed on all endpoints?", ["DLP", "data loss prevention"]),

  answerable("IM-01", "Incident Management", "Do you have a documented incident response plan?", "This plan describes how Northbeam Software detects, responds to"),
  answerable("IM-02", "Incident Management", "Within what timeframe will you notify customers of a security breach affecting their data?", "within 72 hours of confirming the breach"),
  answerable("IM-03", "Incident Management", "Is the incident response plan tested, and how often?", "tested at least annually through a tabletop exercise"),
  answerable("IM-04", "Incident Management", "Do you provide 24/7 on-call coverage for security incidents?", "24/7 on-call rotation"),

  answerable("BC-01", "Business Continuity", "How often are backups performed, and are they encrypted?", "Backups are taken daily, encrypted with AES-256"),
  answerable("BC-02", "Business Continuity", "How long are backups retained?", "Backups are retained for 35 days"),
  answerable("BC-03", "Business Continuity", "What are your recovery point (RPO) and recovery time (RTO) objectives?", "Recovery time objective \\(RTO\\):\\*\\* 8 hours"),
  answerable("BC-04", "Business Continuity", "Is your disaster recovery plan tested at least annually?", "Disaster recovery is tested annually"),
  notApplicable(
    "BC-05",
    "Business Continuity",
    "If you operate your own data centres, describe the physical security controls in place.",
    "does not operate its own data centres",
  ),

  answerable("VM-01", "Vendor Management", "Do you maintain a list of subprocessors? Please provide it.", "maintains a public list of subprocessors"),
  answerable("VM-02", "Vendor Management", "How do you assess the security of your vendors?", "the Head of Security reviews its security posture"),
  answerable("VM-03", "Vendor Management", "Will you notify us before adding a new subprocessor?", "at least 30 days before adding or replacing a subprocessor"),
  notApplicable(
    "VM-04",
    "Vendor Management",
    "If you use offshore development centres, describe the security controls applied to them.",
    "does not use offshore development centres",
  ),

  answerable("DV-01", "Development", "Do you follow a secure software development lifecycle?", "secure software development lifecycle \\(secure SDLC\\)"),
  answerable("DV-02", "Development", "Do you scan third-party dependencies for known vulnerabilities?", "dependency scanning of all third-party packages"),
  answerable("DV-03", "Development", "Is an independent penetration test performed at least annually?", "penetration test of the platform is performed at least annually"),
  notApplicable(
    "DV-04",
    "Development",
    "If your software is installed on customer premises, how are security updates delivered?",
    "no Northbeam software is installed on customer premises",
  ),
  notCovered("DV-05", "Development", "Do you run a public bug bounty programme?", ["bug bounty", "bounty"]),
];

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBFC5CC" } },
  bottom: { style: "thin", color: { argb: "FFBFC5CC" } },
  left: { style: "thin", color: { argb: "FFBFC5CC" } },
  right: { style: "thin", color: { argb: "FFBFC5CC" } },
};

/** Builds the demo questionnaire workbook and returns its XLSX bytes. */
export async function buildDemoQuestionnaire(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Attestly demo (synthetic)";
  workbook.created = new Date("2026-10-01T00:00:00Z");

  const intro = workbook.addWorksheet("Instructions");
  intro.getColumn(1).width = 100;
  intro.getCell("A1").value = DEMO_QUESTIONNAIRE_NAME;
  intro.getCell("A1").font = { bold: true, size: 14 };
  intro.getCell("A2").value = "Synthetic demo questionnaire created by Attestly. Acme Corp is a fictional customer.";
  intro.getCell("A3").value = "Answer every question in the Vendor Response column and reference supporting documents in Comments / Evidence.";

  const sheet = workbook.addWorksheet("Security Questionnaire", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.columns = [{ width: 10 }, { width: 80 }, { width: 50 }, { width: 40 }];

  sheet.getCell("A1").value = DEMO_QUESTIONNAIRE_NAME;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF17202A" } };
  sheet.mergeCells("A1:D1");
  sheet.getCell("A2").value = "Synthetic demo document. Please complete all sections and return to security-review@acme.example.";
  sheet.getCell("A2").font = { italic: true, color: { argb: "FF64707D" } };
  sheet.mergeCells("A2:D2");

  const header = sheet.getRow(4);
  header.values = ["Ref", "Question", "Vendor Response", "Comments / Evidence"];
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5C5A" } };
    cell.border = BORDER;
  });

  let rowNumber = 4;
  for (const section of DEMO_SECTIONS) {
    rowNumber += 1;
    const sectionCell = sheet.getCell(rowNumber, 1);
    sectionCell.value = section;
    sectionCell.font = { bold: true };
    sectionCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBE7" } };
    sheet.mergeCells(rowNumber, 1, rowNumber, 4);
    for (const q of DEMO_QUESTIONS.filter((x) => x.section === section)) {
      rowNumber += 1;
      const row = sheet.getRow(rowNumber);
      row.values = [q.ref, q.text];
      for (let col = 1; col <= 4; col++) {
        const cell = row.getCell(col);
        cell.border = BORDER;
        cell.alignment = { vertical: "top", wrapText: true };
      }
    }
  }

  return workbookToBytes(workbook);
}
