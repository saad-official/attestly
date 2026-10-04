/**
 * Deterministic guardrails on a model draft (spec 3.3 step 3). Pure: returns a
 * normalised copy of the draft plus the list of problems it fixed.
 *
 * 1. Every citation id must be one of the retrieved evidence ids ("E2"-style
 *    labels are mapped to the id). Unknown ids are dropped.
 * 2. Every quote must appear in the cited passage after normalising case,
 *    whitespace and punctuation ("..." / "…" may elide text between
 *    fragments that appear in order). Quotes shorter than two words are
 *    rejected because they would match almost anything.
 * 3. A "drafted" answer left with zero valid citations becomes
 *    "needs_evidence" with a note, and its confidence is capped at 0.2.
 * 4. Yes/no questions (first word Do/Does/Is/Are/Has/Have/Can/Will/Did) get a
 *    leading "Yes.", "No." or "Partially." when the answer lacks one, inferred
 *    only from the words of its first sentence; otherwise left untouched.
 * 5. Answers over 1200 characters are cut at the last sentence end that fits.
 */
import type { Citation, DraftAnswer } from "@/lib/draft/schema";
import type { Evidence } from "@/lib/rag/retrieve";

export const MAX_ANSWER_CHARS = 1200;
export const DOWNGRADED_CONFIDENCE_CAP = 0.2;
const MIN_QUOTE_WORDS = 2;

export type ViolationCode =
  | "unknown_citation"
  | "quote_too_short"
  | "quote_not_found"
  | "no_valid_citations"
  | "answer_truncated"
  | "yes_no_prefixed";

export type Violation = {
  code: ViolationCode;
  message: string;
  citationId?: string;
};

export type ValidateOptions = {
  /** Needed for the yes/no rule; without it the rule is skipped. */
  question?: string;
  maxAnswerChars?: number;
};

export type ValidatedDraft = {
  draft: DraftAnswer;
  violations: Violation[];
};

/** Lower-case, strip accents, turn every run of non-letters/digits into one space. */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function wordCount(normalized: string): number {
  return normalized.length === 0 ? 0 : normalized.split(" ").length;
}

/** Fragments split on an ellipsis must appear, whole-word, in order. */
export function quoteAppearsIn(quote: string, passage: string): boolean {
  const fragments = quote
    .split(/\.{3}|…/)
    .map(normalizeForQuote)
    .filter((f) => f.length > 0);
  if (fragments.length === 0) return false;
  const haystack = ` ${normalizeForQuote(passage)} `;
  let from = 0;
  for (const fragment of fragments) {
    const at = haystack.indexOf(` ${fragment} `, from);
    if (at === -1) return false;
    from = at + fragment.length + 1;
  }
  return true;
}

function resolveId(id: string, evidence: Evidence[], byId: Map<string, Evidence>): string {
  if (byId.has(id)) return id;
  const label = id.trim().match(/^\[?E(\d+)\]?$/i);
  if (label) {
    const index = Number(label[1]) - 1;
    if (index >= 0 && index < evidence.length) return evidence[index].id;
  }
  return id;
}

function validateCitations(citations: Citation[], evidence: Evidence[], violations: Violation[]): Citation[] {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const valid: Citation[] = [];
  for (const raw of citations) {
    const id = resolveId(raw.id, evidence, byId);
    const passage = byId.get(id);
    if (!passage) {
      violations.push({ code: "unknown_citation", citationId: raw.id, message: `Citation "${raw.id}" is not in the retrieved evidence.` });
      continue;
    }
    const normalizedQuote = normalizeForQuote(raw.quote.replace(/\.{3}|…/g, " "));
    if (wordCount(normalizedQuote) < MIN_QUOTE_WORDS) {
      violations.push({ code: "quote_too_short", citationId: id, message: `Quote for "${id}" is too short to verify.` });
      continue;
    }
    if (!quoteAppearsIn(raw.quote, passage.text)) {
      violations.push({ code: "quote_not_found", citationId: id, message: `Quote "${raw.quote}" does not appear in "${id}".` });
      continue;
    }
    const key = `${id}\u0000${normalizedQuote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({ id, quote: raw.quote });
  }
  return valid;
}

const QUESTION_NUMBER = /^\s*(?:[A-Z]{1,4}[\s.-]?)?\d[\w.-]*[.):]?\s+/;
const YES_NO_FIRST_WORD = /^(do|does|is|are|has|have|can|will|did)\b/i;

export function isYesNoQuestion(question: string): boolean {
  return YES_NO_FIRST_WORD.test(question.replace(QUESTION_NUMBER, "").trimStart());
}

const LEADING_VERDICT = /^\s*(yes|no|partially)\b/i;

/** "Yes." | "No." | "Partially." from the first sentence, or null when unclear. */
export function inferVerdict(answer: string): "Yes." | "No." | "Partially." | null {
  const firstSentence = answer.split(/(?<=[.!?])\s/)[0] ?? "";
  const lowered = firstSentence.toLowerCase().replace(/\bnot (only|just)\b/g, " ");
  const words = new Set(normalizeForQuote(lowered.replace(/n['’]t\b/g, " not")).split(" "));
  if (words.has("partially")) return "Partially.";
  const no = words.has("no") || words.has("not");
  const yes = words.has("yes");
  if (yes && no) return null;
  if (no) return "No.";
  if (yes) return "Yes.";
  return null;
}

export function truncateAnswer(answer: string, maxChars: number): string {
  if (answer.length <= maxChars) return answer;
  let cut = -1;
  for (const match of answer.matchAll(/[.!?]["')\]]*(?=\s|$)/g)) {
    const end = match.index + match[0].length;
    if (end > maxChars) break;
    cut = end;
  }
  if (cut > 0) return answer.slice(0, cut).trimEnd();
  const slice = answer.slice(0, maxChars - 1);
  const space = slice.lastIndexOf(" ");
  return `${(space > 0 ? slice.slice(0, space) : slice).trimEnd()}…`;
}

export function validateDraft(draft: DraftAnswer, evidence: Evidence[], options: ValidateOptions = {}): ValidatedDraft {
  const maxChars = options.maxAnswerChars ?? MAX_ANSWER_CHARS;
  const violations: Violation[] = [];
  const out: DraftAnswer = {
    ...draft,
    confidence: Math.min(1, Math.max(0, Number.isFinite(draft.confidence) ? draft.confidence : 0)),
    citations: validateCitations(draft.citations, evidence, violations),
  };

  if (out.status === "drafted" && out.citations.length === 0) {
    violations.push({ code: "no_valid_citations", message: "No valid citation supports this draft; marked as needs evidence." });
    out.status = "needs_evidence";
    out.confidence = Math.min(out.confidence, DOWNGRADED_CONFIDENCE_CAP);
    const note = "No cited evidence supports this answer; add or link a policy that covers it.";
    out.notes = draft.notes ? `${note} ${draft.notes}` : note;
  }

  if (out.status === "drafted" && options.question && isYesNoQuestion(options.question) && !LEADING_VERDICT.test(out.answer)) {
    const verdict = inferVerdict(out.answer);
    if (verdict) {
      out.answer = `${verdict} ${out.answer.trimStart()}`;
      violations.push({ code: "yes_no_prefixed", message: `Added "${verdict}" to answer a yes/no question.` });
    }
  }

  if (out.answer.length > maxChars) {
    out.answer = truncateAnswer(out.answer, maxChars);
    violations.push({ code: "answer_truncated", message: `Answer was longer than ${maxChars} characters and was shortened.` });
  }

  return { draft: out, violations };
}
