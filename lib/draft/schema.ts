/**
 * Structured output contract for the draft writer (spec 3.3 step 2).
 * Citations reference evidence ids (chunk ids or library answer ids).
 */
import { z } from "zod";

export const DRAFT_STATUSES = ["drafted", "needs_evidence", "not_applicable"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const CitationSchema = z.object({
  id: z.string().describe("The id of the evidence passage, exactly as given in the evidence list."),
  quote: z.string().describe("A short verbatim quote from that passage that supports the answer."),
});

export const DraftAnswerSchema = z.object({
  answer: z.string().describe("The answer text to put in the questionnaire."),
  status: z.enum(DRAFT_STATUSES),
  citations: z.array(CitationSchema),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional().describe("One line for the reviewer, e.g. which document would answer the question."),
});

export type Citation = z.infer<typeof CitationSchema>;
export type DraftAnswer = z.infer<typeof DraftAnswerSchema>;
