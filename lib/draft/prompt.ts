/**
 * Prompt for the draft writer (spec 3.3 step 2). Evidence is numbered
 * [E1]..[En] and carries its id so the model can cite it; the instructions
 * forbid any claim the evidence does not state. Bump DRAFT_PROMPT_VERSION when
 * the wording changes materially (it is logged with every call).
 */
import type { Evidence } from "@/lib/rag/retrieve";

export const DRAFT_PROMPT_VERSION = "draft-v1";

export type AnswerStyle = "concise" | "detailed";

export type DraftPromptInput = {
  question: string;
  section?: string;
  evidence: Evidence[];
  companyName: string;
  answerStyle: AnswerStyle;
  /** Long passages are cut to this many characters in the prompt. Default 2000. */
  maxCharsPerEvidence?: number;
};

export type DraftPrompt = {
  instructions: string;
  prompt: string;
  promptVersion: string;
};

const STYLE_GUIDANCE: Record<AnswerStyle, string> = {
  concise: "Keep the answer short: one to three sentences, plain and factual.",
  detailed:
    "Give a detailed answer: up to two short paragraphs naming the specific controls, frequencies and owners the evidence states.",
};

function trimPassage(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()} [passage trimmed]`;
}

function describeEvidence(e: Evidence, index: number, maxChars: number): string {
  const label = `[E${index + 1}] id="${e.id}"`;
  const source =
    e.kind === "library"
      ? `past approved answer to: "${e.title}"`
      : `policy: ${[e.title, ...(e.headingPath ?? []).filter((h) => h !== e.title)].join(" > ")}`;
  return `${label} | ${source}\n${trimPassage(e.text, maxChars)}`;
}

export function buildDraftPrompt(input: DraftPromptInput): DraftPrompt {
  const maxChars = input.maxCharsPerEvidence ?? 2000;
  const instructions = [
    `You draft answers to a customer's security questionnaire on behalf of ${input.companyName}.`,
    "Use ONLY the facts stated in the numbered evidence passages. Never invent, assume or generalise controls, certifications, numbers, dates or vendors that the evidence does not state. Do not use outside knowledge about the company.",
    "Every factual sentence must be supported by at least one citation. A citation is the passage id (the value in id=\"...\", not the [E] label) plus a short quote copied verbatim from that passage (a few words to one sentence, no paraphrasing).",
    "Past approved answers are evidence too, but prefer policy passages when both say the same thing.",
    "Status:",
    '- "drafted": the evidence answers the question. Write the answer in the first person plural ("We ...") or with the company name, with citations.',
    '- "needs_evidence": the evidence does not answer the question, or only partly and the missing part matters. Leave the answer empty or state only what is supported, and put in notes one line naming the document or policy that would answer it.',
    '- "not_applicable": the evidence shows the question does not apply to this company (e.g. it asks about something the company explicitly does not do or operate). Explain why in one sentence, citing the passage when there is one.',
    "For yes/no questions, start the answer with Yes., No. or Partially. when the evidence supports it.",
    STYLE_GUIDANCE[input.answerStyle],
    "confidence is 0 to 1: how fully the cited evidence answers the question.",
  ].join("\n");

  const evidenceBlock =
    input.evidence.length === 0
      ? "No evidence was retrieved for this question. Return status needs_evidence with an empty citation list."
      : input.evidence.map((e, i) => describeEvidence(e, i, maxChars)).join("\n\n");

  const prompt = [
    input.section ? `Section: ${input.section}` : null,
    `Question: ${input.question.trim()}`,
    "",
    "Evidence:",
    evidenceBlock,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { instructions, prompt, promptVersion: DRAFT_PROMPT_VERSION };
}
