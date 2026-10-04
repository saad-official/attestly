import { describe, expect, it, vi } from "vitest";
import { DraftAnswerSchema, type DraftAnswer } from "@/lib/draft/schema";
import { DRAFT_PROMPT_VERSION, buildDraftPrompt } from "@/lib/draft/prompt";
import { DraftOutputError, createModelDrafter, draftAnswer, type DraftRequest } from "@/lib/draft/draft";

const generateStructured = vi.hoisted(() =>
  vi.fn(async (req: { promptVersion: string }) => ({
    object: { answer: "Yes.", status: "drafted", citations: [], confidence: 0.5 },
    meta: { model: "groq-test", promptVersion: req.promptVersion, tokensIn: 1, tokensOut: 1, latencyMs: 1, attempts: 1 },
  })),
);
vi.mock("@/lib/ai/generate", () => ({ generateStructured }));
import type { Evidence } from "@/lib/rag/retrieve";

const evidence: Evidence[] = [
  {
    kind: "chunk",
    id: "c-mfa",
    title: "Access Control Policy",
    headingPath: ["Access Control Policy", "Authentication"],
    text: "MFA is enforced on all systems, including email and source control.",
    score: 0.03,
  },
  {
    kind: "library",
    id: "l-ins",
    title: "Do you carry cyber insurance?",
    text: "Yes. Northbeam holds a cyber liability policy.",
    score: 0.01,
  },
];

describe("DraftAnswerSchema", () => {
  it("accepts a well-formed draft and rejects bad status or confidence", () => {
    const ok: DraftAnswer = { answer: "Yes.", status: "drafted", citations: [{ id: "c-mfa", quote: "MFA is enforced" }], confidence: 0.8 };
    expect(DraftAnswerSchema.parse(ok)).toEqual(ok);
    expect(DraftAnswerSchema.safeParse({ ...ok, status: "approved" }).success).toBe(false);
    expect(DraftAnswerSchema.safeParse({ ...ok, confidence: 1.5 }).success).toBe(false);
    expect(DraftAnswerSchema.safeParse({ ...ok, notes: "One line." }).success).toBe(true);
  });
});

describe("buildDraftPrompt", () => {
  const built = buildDraftPrompt({
    question: "Do you enforce MFA?",
    section: "Access Control",
    evidence,
    companyName: "Northbeam Software",
    answerStyle: "concise",
  });

  it("numbers the evidence [E1]..[En] with ids, titles and heading paths", () => {
    expect(built.prompt).toContain('[E1] id="c-mfa"');
    expect(built.prompt).toContain("Access Control Policy > Authentication");
    expect(built.prompt).toContain("MFA is enforced on all systems, including email and source control.");
    expect(built.prompt).toContain('[E2] id="l-ins"');
    expect(built.prompt).toMatch(/\[E2\][^\n]*past approved answer[^\n]*Do you carry cyber insurance\?/i);
  });

  it("includes the question, section and company", () => {
    expect(built.prompt).toContain("Question: Do you enforce MFA?");
    expect(built.prompt).toContain("Section: Access Control");
    expect(built.instructions).toContain("Northbeam Software");
  });

  it("forbids unsupported claims and explains statuses and citations", () => {
    const text = built.instructions;
    expect(text).toMatch(/only.*evidence/i);
    expect(text).toMatch(/never|do not/i);
    expect(text).toContain("needs_evidence");
    expect(text).toContain("not_applicable");
    expect(text).toMatch(/verbatim/i);
    expect(text).toMatch(/id/);
    expect(built.promptVersion).toBe(DRAFT_PROMPT_VERSION);
  });

  it("varies the length guidance with the answer style", () => {
    const detailed = buildDraftPrompt({ question: "q", evidence, companyName: "N", answerStyle: "detailed" });
    expect(detailed.instructions).not.toEqual(built.instructions);
    expect(detailed.instructions).toMatch(/detail/i);
  });

  it("says so when there is no evidence", () => {
    const empty = buildDraftPrompt({ question: "Do you have a HIPAA BAA?", evidence: [], companyName: "N", answerStyle: "concise" });
    expect(empty.prompt).toMatch(/no evidence was retrieved/i);
    expect(empty.prompt).not.toContain("[E1]");
  });

  it("trims very long passages but keeps the start verbatim", () => {
    const long: Evidence = { ...evidence[0], text: `${"Backups are encrypted daily. ".repeat(200)}END` };
    const out = buildDraftPrompt({ question: "q", evidence: [long], companyName: "N", answerStyle: "concise", maxCharsPerEvidence: 300 });
    expect(out.prompt).toContain("Backups are encrypted daily.");
    expect(out.prompt).not.toContain("END");
    expect(out.prompt.length).toBeLessThan(3000);
  });
});

describe("draftAnswer", () => {
  const input = {
    question: "Do you enforce MFA?",
    section: "Access Control",
    evidence,
    companyName: "Northbeam Software",
    answerStyle: "concise" as const,
  };

  it("sends the built prompt and schema to the generator, then applies guardrails", async () => {
    const requests: DraftRequest[] = [];
    const result = await draftAnswer(input, {
      generate: async (req) => {
        requests.push(req);
        return {
          answer: "MFA is enforced on all systems.",
          status: "drafted",
          citations: [{ id: "E1", quote: "MFA is enforced on all systems" }],
          confidence: 0.85,
        };
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe("draft_writer");
    expect(requests[0].schema).toBe(DraftAnswerSchema);
    expect(requests[0].promptVersion).toBe(DRAFT_PROMPT_VERSION);
    expect(requests[0].prompt).toContain("Question: Do you enforce MFA?");
    expect(result.draft.citations).toEqual([{ id: "c-mfa", quote: "MFA is enforced on all systems" }]);
    expect(result.draft.status).toBe("drafted");
    expect(result.violations).toEqual([]);
    expect(result.meta).toBeUndefined();
  });

  it("downgrades a hallucinated citation to needs_evidence", async () => {
    const result = await draftAnswer(input, {
      generate: async () => ({
        answer: "Yes, and we are ISO 27001 certified.",
        status: "drafted",
        citations: [{ id: "c-iso", quote: "ISO 27001 certified" }],
        confidence: 0.9,
      }),
    });
    expect(result.draft.status).toBe("needs_evidence");
    expect(result.violations.map((v) => v.code)).toEqual(["unknown_citation", "no_valid_citations"]);
  });

  it("passes model call metadata through when the generator returns it", async () => {
    const meta = { model: "fake", promptVersion: DRAFT_PROMPT_VERSION, tokensIn: 10, tokensOut: 5, latencyMs: 3, attempts: 1 };
    const result = await draftAnswer(input, {
      generate: async () => ({
        object: { answer: "Not applicable.", status: "not_applicable", citations: [], confidence: 0.7 },
        meta,
      }),
    });
    expect(result.meta).toEqual(meta);
    expect(result.draft.status).toBe("not_applicable");
  });

  it("rejects output that does not match the schema", async () => {
    const attempt = draftAnswer(input, {
      generate: async () => ({ answer: "x", status: "maybe", citations: [], confidence: 0.5 }) as unknown as DraftAnswer,
    });
    await expect(attempt).rejects.toBeInstanceOf(DraftOutputError);
  });

  it("propagates generator failures", async () => {
    await expect(
      draftAnswer(input, {
        generate: async () => {
          throw new Error("rate limited");
        },
      }),
    ).rejects.toThrow("rate limited");
  });
});

describe("createModelDrafter", () => {
  it("delegates to generateStructured with the draft request", async () => {
    const generate = createModelDrafter();
    const result = await draftAnswer(
      { question: "Do you enforce MFA?", evidence, companyName: "Northbeam Software", answerStyle: "concise" },
      { generate },
    );
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(generateStructured.mock.calls[0][0]).toMatchObject({ name: "draft_writer", schema: DraftAnswerSchema, temperature: 0.2 });
    expect(result.meta?.model).toBe("groq-test");
    expect(result.draft.status).toBe("needs_evidence");
  });
});
