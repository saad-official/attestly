/**
 * Test doubles for the service layer: a deterministic draft writer that
 * cites the first retrieved passage verbatim (so guardrails accept it), and
 * an embedder that always fails (to exercise the "embed later" paths).
 */
import type { DraftGenerator, DraftRequest } from "@/lib/draft/draft";
import type { DraftAnswer } from "@/lib/draft/schema";
import type { Embedder } from "@/lib/rag/embeddings";

export type FakeDrafterOptions = {
  /** Questions containing any of these substrings come back as needs_evidence. */
  needsEvidence?: string[];
  /** Questions containing any of these substrings make the model throw. */
  failOn?: string[];
};

export function questionOf(req: DraftRequest): string {
  return /^Question: (.*)$/m.exec(req.prompt)?.[1] ?? "";
}

/** Evidence blocks as printed by buildDraftPrompt: `[E1] id="..." | source\npassage`. */
export function evidenceOf(req: DraftRequest): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = [];
  const pattern = /\[E\d+\] id="([^"]+)" \| [^\n]*\n([\s\S]*?)(?=\n\n\[E\d+\] id=|$)/g;
  for (const match of req.prompt.matchAll(pattern)) out.push({ id: match[1], text: match[2] });
  return out;
}

export function createFakeDrafter(options: FakeDrafterOptions = {}): DraftGenerator & { calls: DraftRequest[] } {
  const calls: DraftRequest[] = [];
  const generate = async (req: DraftRequest) => {
    calls.push(req);
    const question = questionOf(req);
    if (options.failOn?.some((s) => question.includes(s))) throw new Error("model exploded (fake)");
    const evidence = evidenceOf(req);
    const first = evidence[0];
    if (!first || options.needsEvidence?.some((s) => question.includes(s))) {
      const answer: DraftAnswer = {
        answer: "",
        status: "needs_evidence",
        citations: [],
        confidence: 0.1,
        notes: "Add a policy that covers this.",
      };
      return answer;
    }
    const quote = first.text.replace(/\[passage trimmed\]$/, "").trim().split(/\s+/).slice(0, 8).join(" ");
    const answer: DraftAnswer = {
      answer: `Yes. ${quote}.`,
      status: "drafted",
      citations: [{ id: first.id, quote }],
      confidence: 0.9,
    };
    return {
      object: answer,
      meta: { model: "fake-model", promptVersion: req.promptVersion, tokensIn: 100, tokensOut: 20, latencyMs: 1, attempts: 1 },
    };
  };
  return Object.assign(generate, { calls });
}

export function createFailingEmbedder(): Embedder {
  return {
    dimensions: 768,
    async embed() {
      throw new Error("embedding provider down (fake)");
    },
  };
}
