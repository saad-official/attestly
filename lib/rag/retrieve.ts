/**
 * Hybrid retrieval merge (spec 3.3 step 1). The database layer runs the
 * searches (pgvector cosine over chunks, Postgres full-text over chunks,
 * pgvector over library answers) and hands the ranked hit lists here.
 *
 * Reciprocal rank fusion: score(d) = sum over lists of 1 / (k + rank), with
 * 1-based ranks and k = 60. Only the best rank of a document within one list
 * counts. Ties go to chunk passages before library answers, then to the order
 * of first appearance (vector, keyword, library). Ids are deduped across
 * kinds (a chunk wins over a library answer with the same id).
 */

export type Evidence = {
  kind: "chunk" | "library";
  id: string;
  text: string;
  /** Document title for chunks; the past question for library answers. */
  title: string;
  headingPath?: string[];
  score: number;
};

export type ChunkHit = {
  id: string;
  text: string;
  /** Title of the document the chunk belongs to. */
  title: string;
  headingPath?: string[];
};

export type LibraryHit = {
  id: string;
  question: string;
  answer: string;
};

export type MergeInput = {
  vectorHits: ChunkHit[];
  keywordHits: ChunkHit[];
  libraryHits: LibraryHit[];
};

export type MergeOptions = {
  k?: number;
  maxChunks?: number;
  maxLibrary?: number;
};

export const RRF_K = 60;
export const MAX_CHUNK_EVIDENCE = 8;
export const MAX_LIBRARY_EVIDENCE = 4;

type Candidate = { evidence: Evidence; order: number };

function fuse(lists: Array<Array<{ id: string; evidence: Omit<Evidence, "score"> }>>, k: number, into: Map<string, Candidate>, seen: Set<string>, startOrder: number): number {
  let order = startOrder;
  for (const list of lists) {
    const counted = new Set<string>();
    list.forEach((hit, index) => {
      if (counted.has(hit.id) || seen.has(hit.id)) return;
      counted.add(hit.id);
      const contribution = 1 / (k + index + 1);
      const existing = into.get(hit.id);
      if (existing) {
        existing.evidence.score += contribution;
      } else {
        into.set(hit.id, { evidence: { ...hit.evidence, score: contribution }, order: order++ });
      }
    });
  }
  return order;
}

function byRank(a: Candidate, b: Candidate): number {
  return b.evidence.score - a.evidence.score || a.order - b.order;
}

export function mergeCandidates(input: MergeInput, options: MergeOptions = {}): Evidence[] {
  const k = options.k ?? RRF_K;
  const maxChunks = options.maxChunks ?? MAX_CHUNK_EVIDENCE;
  const maxLibrary = options.maxLibrary ?? MAX_LIBRARY_EVIDENCE;

  const toChunk = (hit: ChunkHit) => ({
    id: hit.id,
    evidence: {
      kind: "chunk" as const,
      id: hit.id,
      text: hit.text,
      title: hit.title,
      ...(hit.headingPath ? { headingPath: [...hit.headingPath] } : {}),
    },
  });
  const usable = <T extends { text: string }>(hit: { evidence: T }) => hit.evidence.text.trim().length > 0;

  const chunks = new Map<string, Candidate>();
  const nextOrder = fuse(
    [input.vectorHits.map(toChunk).filter(usable), input.keywordHits.map(toChunk).filter(usable)],
    k,
    chunks,
    new Set(),
    0,
  );

  const library = new Map<string, Candidate>();
  fuse(
    [
      input.libraryHits
        .map((hit) => ({
          id: hit.id,
          evidence: { kind: "library" as const, id: hit.id, text: hit.answer, title: hit.question },
        }))
        .filter(usable),
    ],
    k,
    library,
    new Set(chunks.keys()),
    nextOrder,
  );

  const topChunks = [...chunks.values()].sort(byRank).slice(0, maxChunks);
  const topLibrary = [...library.values()].sort(byRank).slice(0, maxLibrary);
  return [...topChunks, ...topLibrary]
    .sort((a, b) => {
      const diff = b.evidence.score - a.evidence.score;
      if (diff !== 0) return diff;
      if (a.evidence.kind !== b.evidence.kind) return a.evidence.kind === "chunk" ? -1 : 1;
      return a.order - b.order;
    })
    .map((c) => c.evidence);
}
