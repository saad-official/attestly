import { describe, expect, it } from "vitest";
import type { DraftAnswer } from "@/lib/draft/schema";
import { MAX_ANSWER_CHARS, isYesNoQuestion, normalizeForQuote, validateDraft } from "@/lib/draft/guardrails";
import type { Evidence } from "@/lib/rag/retrieve";

const evidence: Evidence[] = [
  {
    kind: "chunk",
    id: "chunk-mfa",
    title: "Access Control Policy",
    headingPath: ["Access Control Policy", "Authentication"],
    text: "Multi-factor authentication (MFA) is enforced on all production systems,\nemail and source control. Access is reviewed quarterly by system owners.",
    score: 0.03,
  },
  {
    kind: "chunk",
    id: "chunk-backup",
    title: "Business Continuity & Disaster Recovery",
    text: "Backups are taken daily, encrypted with AES-256, and retained for 35 days.",
    score: 0.02,
  },
  {
    kind: "library",
    id: "lib-1",
    title: "Do you have cyber insurance?",
    text: "Yes. Northbeam holds a cyber liability policy renewed annually.",
    score: 0.01,
  },
];

function draft(overrides: Partial<DraftAnswer> = {}): DraftAnswer {
  return {
    answer: "MFA is enforced on all production systems.",
    status: "drafted",
    citations: [{ id: "chunk-mfa", quote: "MFA is enforced on all production systems" }],
    confidence: 0.9,
    ...overrides,
  };
}

const codes = (r: ReturnType<typeof validateDraft>) => r.violations.map((v) => v.code);

describe("normalizeForQuote", () => {
  it("folds case, whitespace, punctuation and typographic quotes", () => {
    expect(normalizeForQuote("  “Multi-factor”  Authentication\n(MFA) — is ENFORCED. ")).toBe(
      "multi factor authentication mfa is enforced",
    );
  });
});

describe("validateDraft: citations", () => {
  it("keeps valid citations and reports nothing", () => {
    const result = validateDraft(draft(), evidence);
    expect(result.violations).toEqual([]);
    expect(result.draft).toEqual(draft());
  });

  it("drops citations whose id is not in the evidence", () => {
    const result = validateDraft(
      draft({
        citations: [
          { id: "chunk-mfa", quote: "MFA is enforced on all production systems" },
          { id: "made-up", quote: "anything" },
        ],
      }),
      evidence,
    );
    expect(result.draft.citations.map((c) => c.id)).toEqual(["chunk-mfa"]);
    expect(codes(result)).toEqual(["unknown_citation"]);
    expect(result.violations[0].citationId).toBe("made-up");
  });

  it("matches quotes ignoring case, whitespace, punctuation and line breaks", () => {
    const result = validateDraft(
      draft({ citations: [{ id: "chunk-mfa", quote: "multi factor authentication (mfa) is enforced on all production systems, email" }] }),
      evidence,
    );
    expect(result.violations).toEqual([]);
    expect(result.draft.citations).toHaveLength(1);
  });

  it("drops a citation whose quote is not in the cited passage, even if it is in another one", () => {
    const result = validateDraft(
      draft({
        citations: [
          { id: "chunk-mfa", quote: "MFA is enforced on all production systems" },
          { id: "chunk-mfa", quote: "retained for 35 days" },
          { id: "chunk-backup", quote: "retained for 90 days" },
        ],
      }),
      evidence,
    );
    expect(result.draft.citations).toEqual([{ id: "chunk-mfa", quote: "MFA is enforced on all production systems" }]);
    expect(codes(result)).toEqual(["quote_not_found", "quote_not_found"]);
  });

  it("accepts quotes elided with an ellipsis when the fragments appear in order", () => {
    const ok = validateDraft(
      draft({ citations: [{ id: "chunk-backup", quote: "Backups are taken daily … retained for 35 days" }] }),
      evidence,
    );
    expect(ok.violations).toEqual([]);
    const wrongOrder = validateDraft(
      draft({ citations: [{ id: "chunk-backup", quote: "retained for 35 days ... Backups are taken daily" }] }),
      evidence,
    );
    expect(codes(wrongOrder)).toContain("quote_not_found");
  });

  it("rejects empty or one-word quotes that would match anything", () => {
    const result = validateDraft(
      draft({
        citations: [
          { id: "chunk-mfa", quote: "MFA is enforced on all production systems" },
          { id: "chunk-mfa", quote: "MFA" },
          { id: "chunk-backup", quote: "  " },
        ],
      }),
      evidence,
    );
    expect(result.draft.citations).toHaveLength(1);
    expect(codes(result)).toEqual(["quote_too_short", "quote_too_short"]);
  });

  it("maps evidence labels like E2 to the evidence id", () => {
    const result = validateDraft(draft({ citations: [{ id: "[E2]", quote: "retained for 35 days" }] }), evidence);
    expect(result.draft.citations).toEqual([{ id: "chunk-backup", quote: "retained for 35 days" }]);
    expect(result.violations).toEqual([]);
  });

  it("removes duplicate citations silently", () => {
    const result = validateDraft(
      draft({
        citations: [
          { id: "chunk-mfa", quote: "MFA is enforced on all production systems" },
          { id: "chunk-mfa", quote: "mfa is enforced on all production systems." },
        ],
      }),
      evidence,
    );
    expect(result.draft.citations).toHaveLength(1);
    expect(result.violations).toEqual([]);
  });
});

describe("validateDraft: status", () => {
  it("downgrades a drafted answer with no valid citation to needs_evidence with a note", () => {
    const result = validateDraft(draft({ citations: [{ id: "chunk-mfa", quote: "SOC 2 Type II report" }], notes: "Model note." }), evidence);
    expect(result.draft.status).toBe("needs_evidence");
    expect(result.draft.notes).toMatch(/no cited evidence/i);
    expect(result.draft.notes).toContain("Model note.");
    expect(result.draft.confidence).toBeLessThanOrEqual(0.2);
    expect(codes(result)).toEqual(["quote_not_found", "no_valid_citations"]);
  });

  it("downgrades a drafted answer that cites nothing at all", () => {
    const result = validateDraft(draft({ citations: [] }), evidence);
    expect(result.draft.status).toBe("needs_evidence");
    expect(codes(result)).toEqual(["no_valid_citations"]);
  });

  it("leaves not_applicable and needs_evidence answers without citations alone", () => {
    for (const status of ["not_applicable", "needs_evidence"] as const) {
      const result = validateDraft(draft({ status, citations: [], answer: "Not applicable: no on-premise software." }), evidence);
      expect(result.draft.status).toBe(status);
      expect(result.violations).toEqual([]);
    }
  });

  it("clamps confidence into 0..1", () => {
    expect(validateDraft(draft({ confidence: 1.4 }), evidence).draft.confidence).toBe(1);
    expect(validateDraft(draft({ confidence: -1 }), evidence).draft.confidence).toBe(0);
  });

  it("does not mutate the input draft", () => {
    const input = draft({ citations: [{ id: "nope", quote: "x y" }] });
    const snapshot = structuredClone(input);
    validateDraft(input, evidence);
    expect(input).toEqual(snapshot);
  });
});

describe("validateDraft: length", () => {
  it("truncates answers over 1200 characters at a sentence boundary", () => {
    const sentence = "MFA is enforced on all production systems and reviewed every quarter. ";
    const long = sentence.repeat(30).trim(); // ~2100 chars
    const result = validateDraft(draft({ answer: long }), evidence);
    expect(MAX_ANSWER_CHARS).toBe(1200);
    expect(result.draft.answer.length).toBeLessThanOrEqual(1200);
    expect(result.draft.answer.endsWith("quarter.")).toBe(true);
    expect(codes(result)).toEqual(["answer_truncated"]);
  });

  it("cuts at a word boundary with an ellipsis when there is no sentence end", () => {
    const result = validateDraft(draft({ answer: "word ".repeat(400).trim() }), evidence);
    expect(result.draft.answer.length).toBeLessThanOrEqual(1200);
    expect(result.draft.answer.endsWith("word…")).toBe(true);
  });

  it("leaves answers of exactly 1200 characters alone", () => {
    const answer = `${"a".repeat(1199)}.`;
    expect(validateDraft(draft({ answer }), evidence).draft.answer).toBe(answer);
  });
});

describe("validateDraft: yes/no questions", () => {
  const run = (question: string, answer: string, status: DraftAnswer["status"] = "drafted") =>
    validateDraft(draft({ answer, status }), evidence, { question }).draft.answer;

  it("recognises yes/no questions by their first word", () => {
    for (const q of ["Do you", "Does the vendor", "Is data", "Are laptops", "Has the", "Have you", "Can users", "Will you", "Did you"]) {
      expect(isYesNoQuestion(`${q} encrypt data?`)).toBe(true);
    }
    expect(isYesNoQuestion("  1.2 Do you encrypt data?")).toBe(true);
    expect(isYesNoQuestion("Q3. does MFA apply?")).toBe(true);
    expect(isYesNoQuestion("Describe your backup process.")).toBe(false);
    expect(isYesNoQuestion("Isolation of tenants: describe.")).toBe(false);
  });

  it("adds No. when the first sentence says no or not", () => {
    expect(run("Do you store cardholder data?", "Northbeam does not store cardholder data. Payments go via Stripe.")).toBe(
      "No. Northbeam does not store cardholder data. Payments go via Stripe.",
    );
    expect(run("Is there an exception?", "There are no exceptions.")).toBe("No. There are no exceptions.");
  });

  it("adds Yes. or Partially. from the first sentence words", () => {
    expect(run("Is data encrypted at rest?", "Data is encrypted at rest; yes, with AES-256.")).toBe(
      "Yes. Data is encrypted at rest; yes, with AES-256.",
    );
    expect(run("Is MFA enforced?", "MFA is partially rolled out. Admins are covered.")).toBe(
      "Partially. MFA is partially rolled out. Admins are covered.",
    );
  });

  it("leaves the answer untouched when the first sentence has no signal", () => {
    expect(run("Do you enforce MFA?", "MFA is enforced on all systems. Not optional.")).toBe(
      "MFA is enforced on all systems. Not optional.",
    );
    expect(run("Do you enforce MFA?", "MFA covers not only staff but also contractors.")).toBe(
      "MFA covers not only staff but also contractors.",
    );
    expect(run("Do you have a SOC 2 report?", "Northbeam plans a SOC 2 Type II audit.")).toBe(
      "Northbeam plans a SOC 2 Type II audit.",
    );
  });

  it("leaves answers that already lead with Yes, No or Partially", () => {
    expect(run("Do you enforce MFA?", "Yes, on all systems.")).toBe("Yes, on all systems.");
    expect(run("Do you enforce MFA?", "no - not yet.")).toBe("no - not yet.");
    expect(run("Do you enforce MFA?", "Partially: admins only.")).toBe("Partially: admins only.");
  });

  it("is ambiguous (untouched) when the first sentence says both yes and no", () => {
    expect(run("Do you rotate keys?", "Keys rotate yearly, yes, but not for legacy systems.")).toBe(
      "Keys rotate yearly, yes, but not for legacy systems.",
    );
  });

  it("skips non-yes/no questions and answers that are not drafted", () => {
    expect(run("Describe your access reviews.", "Access is not reviewed by HR.")).toBe("Access is not reviewed by HR.");
    expect(run("Do you have a BAA?", "No evidence found.", "needs_evidence")).toBe("No evidence found.");
  });

  it("records the prefix it added", () => {
    const result = validateDraft(draft({ answer: "We do not." }), evidence, { question: "Do you sell data?" });
    expect(result.violations.map((v) => v.code)).toEqual(["yes_no_prefixed"]);
  });
});
