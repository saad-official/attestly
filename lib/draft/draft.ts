/**
 * Draft one questionnaire answer: prompt -> model -> guardrails (spec 3.3).
 * The model is injected (`deps.generate`) so tests and the demo can run
 * without a key; `createModelDrafter()` wires the real Groq/Gemini call.
 */
import type { CallMeta } from "@/lib/ai/generate";
import { validateDraft, type Violation } from "@/lib/draft/guardrails";
import { buildDraftPrompt, type DraftPromptInput } from "@/lib/draft/prompt";
import { DraftAnswerSchema, type DraftAnswer } from "@/lib/draft/schema";

export type DraftInput = DraftPromptInput;

export type DraftRequest = {
  name: "draft_writer";
  promptVersion: string;
  schema: typeof DraftAnswerSchema;
  instructions: string;
  prompt: string;
  temperature: number;
};

export type DraftCallMeta = CallMeta;

/** A generator returns the draft, optionally with call metadata for agent_events. */
export type DraftGenerator = (req: DraftRequest) => Promise<DraftAnswer | { object: DraftAnswer; meta: DraftCallMeta }>;

export type DraftResult = {
  draft: DraftAnswer;
  violations: Violation[];
  promptVersion: string;
  meta?: DraftCallMeta;
};

export class DraftOutputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DraftOutputError";
  }
}

function hasMeta(value: unknown): value is { object: unknown; meta: DraftCallMeta } {
  return typeof value === "object" && value !== null && "object" in value && "meta" in value;
}

export async function draftAnswer(input: DraftInput, deps: { generate: DraftGenerator }): Promise<DraftResult> {
  const built = buildDraftPrompt(input);
  const output = await deps.generate({
    name: "draft_writer",
    promptVersion: built.promptVersion,
    schema: DraftAnswerSchema,
    instructions: built.instructions,
    prompt: built.prompt,
    temperature: 0.2,
  });

  const raw = hasMeta(output) ? output.object : output;
  const parsed = DraftAnswerSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DraftOutputError(`Draft writer returned an invalid draft: ${parsed.error.message}`, { cause: parsed.error });
  }

  const { draft, violations } = validateDraft(parsed.data, input.evidence, { question: input.question });
  return {
    draft,
    violations,
    promptVersion: built.promptVersion,
    ...(hasMeta(output) ? { meta: output.meta } : {}),
  };
}

/**
 * The production generator: structured generation with Groq first and
 * Gemini as fallback. Imported lazily because lib/ai/generate is server-only.
 */
export function createModelDrafter(): DraftGenerator {
  return async (req) => {
    const { generateStructured } = await import("@/lib/ai/generate");
    return generateStructured(req);
  };
}
