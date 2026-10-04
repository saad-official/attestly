import { describe, expect, it } from "vitest";
import { DEMO_LIBRARY } from "@/lib/demo/library";
import { DEMO_COMPANY, DEMO_POLICIES } from "@/lib/demo/policies";
import { DEMO_CUSTOMER, DEMO_QUESTIONS, DEMO_QUESTIONNAIRE_NAME, DEMO_SECTIONS, buildDemoQuestionnaire } from "@/lib/demo/questionnaire";
import { chunkDocument, countWords } from "@/lib/ingest/chunk";
import { loadWorkbook } from "@/lib/sheets/cells";
import { detectMapping, readQuestions } from "@/lib/sheets/detect";

const corpus = DEMO_POLICIES.map((p) => p.markdown).join("\n\n");
const has = (pattern: RegExp) => pattern.test(corpus);

describe("demo policies", () => {
  it("has the six policy documents for Northbeam Software", () => {
    expect(DEMO_COMPANY).toBe("Northbeam Software");
    expect(DEMO_POLICIES.map((p) => p.title)).toEqual([
      "Information Security Policy",
      "Access Control Policy",
      "Incident Response Plan",
      "Business Continuity & Disaster Recovery",
      "Vendor Management Policy",
      "Data Retention & Privacy Policy",
    ]);
    for (const p of DEMO_POLICIES) {
      expect(p.fileName).toMatch(/\.md$/);
      expect(p.markdown).toContain("Northbeam Software");
      expect(p.markdown).toMatch(/synthetic/i);
      expect(p.markdown.startsWith(`# ${p.title}`)).toBe(true);
    }
  });

  it("keeps each document between 600 and 1000 words", () => {
    for (const p of DEMO_POLICIES) {
      const words = countWords(p.markdown);
      expect(words, p.title).toBeGreaterThanOrEqual(600);
      expect(words, p.title).toBeLessThanOrEqual(1000);
    }
  });

  it("states the agreed controls consistently", () => {
    expect(has(/MFA[^.]*all (company )?systems/i)).toBe(true);
    expect(has(/access (rights )?(are )?reviewed quarterly|quarterly access reviews?/i)).toBe(true);
    expect(has(/within 72 hours/i)).toBe(true);
    expect(has(/backups are taken daily[^.]*encrypted|daily encrypted backups/i)).toBe(true);
    expect(has(/35 days/)).toBe(true);
    expect(has(/disaster recovery[^.]*tested (at least )?annually|annual disaster recovery test/i)).toBe(true);
    expect(has(/SOC 2 Type II/)).toBe(true);
    expect(has(/eu-west-1/)).toBe(true);
    expect(has(/subprocessors?/i)).toBe(true);
    expect(has(/90 days/)).toBe(true);
    expect(has(/full-disk encryption/i)).toBe(true);
    expect(has(/background checks?/i)).toBe(true);
    expect(has(/dependency scanning/i)).toBe(true);
    expect(has(/secure (software )?development lifecycle|secure SDLC/i)).toBe(true);
  });

  it("never contradicts itself on the key numbers", () => {
    expect(corpus).not.toMatch(/\b(30|60|90)-day backup retention|backups[^.]*retained for (30|60|90) days/i);
    expect(corpus).not.toMatch(/within (24|48) hours of (confirming|becoming aware)/i);
    expect(corpus).not.toMatch(/us-east-1|us-west-2/);
  });

  it("chunks every document into heading-scoped passages", () => {
    for (const p of DEMO_POLICIES) {
      const chunks = chunkDocument(p.markdown);
      expect(chunks.length, p.title).toBeGreaterThanOrEqual(3);
      expect(chunks.every((c) => c.headingPath[0] === p.title)).toBe(true);
    }
  });
});

describe("demo questionnaire", () => {
  it("has 40 questions across the seven sections with the intended mix", () => {
    expect(DEMO_QUESTIONS).toHaveLength(40);
    expect(DEMO_SECTIONS).toEqual([
      "Organisation",
      "Access Control",
      "Data Protection",
      "Incident Management",
      "Business Continuity",
      "Vendor Management",
      "Development",
    ]);
    const count = (k: string) => DEMO_QUESTIONS.filter((q) => q.expected === k).length;
    expect(count("answerable")).toBe(30);
    expect(count("not_covered")).toBe(6);
    expect(count("not_applicable")).toBe(4);
    expect(new Set(DEMO_QUESTIONS.map((q) => q.ref)).size).toBe(40);
  });

  it("only marks questions answerable or not applicable when the policies say so", () => {
    for (const q of DEMO_QUESTIONS.filter((x) => x.expected !== "not_covered")) {
      expect(q.evidence, q.ref).toBeDefined();
      expect(corpus, `${q.ref}: ${q.evidence}`).toMatch(new RegExp(q.evidence ?? "^$", "i"));
    }
  });

  it("keeps the not-covered topics out of the policies and the library", () => {
    const library = DEMO_LIBRARY.map((l) => `${l.question} ${l.answer}`).join(" ");
    for (const q of DEMO_QUESTIONS.filter((x) => x.expected === "not_covered")) {
      expect(q.absentTerms?.length, q.ref).toBeGreaterThan(0);
      for (const term of q.absentTerms ?? []) {
        expect(corpus, `${q.ref} ${term}`).not.toMatch(new RegExp(term, "i"));
        expect(library, `${q.ref} ${term}`).not.toMatch(new RegExp(term, "i"));
      }
    }
  });

  it("builds an XLSX that the importer reads back as 40 questions in 7 sections", async () => {
    const bytes = await buildDemoQuestionnaire();
    const workbook = await loadWorkbook(bytes);
    const mapping = detectMapping(workbook);
    expect(DEMO_CUSTOMER).toBe("Acme Corp");
    expect(DEMO_QUESTIONNAIRE_NAME).toBe("Acme Corp vendor security questionnaire");
    expect(workbook.getWorksheet(mapping.sheetName)?.getCell("A1").value).toBe(DEMO_QUESTIONNAIRE_NAME);
    expect(mapping.columns.answer).toBeDefined();
    expect(mapping.columns.comment).toBeDefined();
    expect(mapping.sections.map((s) => s.label)).toEqual(DEMO_SECTIONS);
    const questions = readQuestions(workbook, mapping);
    expect(questions).toHaveLength(40);
    expect(questions.map((q) => q.externalId)).toEqual(DEMO_QUESTIONS.map((q) => q.ref));
    expect(questions.map((q) => q.section)).toEqual(DEMO_QUESTIONS.map((q) => q.section));
  });
});

describe("demo library", () => {
  it("has 12 past question/answer pairs that mention the company's real controls", () => {
    expect(DEMO_LIBRARY).toHaveLength(12);
    for (const pair of DEMO_LIBRARY) {
      expect(pair.question.trim().length).toBeGreaterThan(10);
      expect(pair.answer.trim().length).toBeGreaterThan(20);
    }
    expect(new Set(DEMO_LIBRARY.map((l) => l.question)).size).toBe(12);
  });
});
