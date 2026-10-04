import type { CitationRef, Question, QuestionStatus } from "@/lib/db/types";
import type { CitationSource, SharedQuestion } from "@/lib/services/questionnaires";

/**
 * One row of the review grid, as sent to the client: the question without
 * retrieval internals or reviewer ids. Shared by the review page and the
 * public share page.
 */
export type GridRow = {
  id: string;
  rowNumber: number;
  section: string | null;
  externalId: string | null;
  text: string;
  status: QuestionStatus;
  confidence: number | null;
  citations: CitationRef[];
  notes: string | null;
  /** What exports: final ?? draft. */
  answer: string | null;
  /** The agent's draft (null on the share page). */
  draft: string | null;
  /** The reviewer changed the agent's draft. */
  edited: boolean;
};

export type SourcesById = Record<string, CitationSource>;

export function toGridRow(q: Question): GridRow {
  const final = q.final?.trim() ? q.final : null;
  const draft = q.draft?.trim() ? q.draft : null;
  return {
    id: q.id,
    rowNumber: q.rowNumber,
    section: q.section,
    externalId: q.externalId,
    text: q.text,
    status: q.status,
    confidence: q.confidence,
    citations: q.citations ?? [],
    notes: q.notes,
    answer: final ?? draft,
    draft,
    edited: final !== null && draft !== null && final.trim() !== draft.trim(),
  };
}

export function sharedToGridRow(q: SharedQuestion): GridRow {
  return {
    id: q.id,
    rowNumber: q.rowNumber,
    section: q.section,
    externalId: q.externalId,
    text: q.text,
    status: q.status,
    confidence: q.confidence,
    citations: q.citations ?? [],
    notes: q.notes,
    answer: q.answer?.trim() ? q.answer : null,
    draft: null,
    edited: false,
  };
}

/** The id a citation points at (chunk or library answer). */
export function citationTarget(c: CitationRef): string | null {
  return c.chunkId ?? c.libraryAnswerId ?? null;
}

/** Only the sources the given rows cite (keeps the client payload small). */
export function pickSources(rows: GridRow[], all: SourcesById): SourcesById {
  const out: SourcesById = {};
  for (const row of rows) {
    for (const c of row.citations) {
      const id = citationTarget(c);
      if (id && all[id]) out[id] = all[id];
    }
  }
  return out;
}
