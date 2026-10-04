import { describe, expect, it } from "vitest";
import { RRF_K, mergeCandidates, type ChunkHit, type LibraryHit } from "@/lib/rag/retrieve";

const chunk = (id: string, extra: Partial<ChunkHit> = {}): ChunkHit => ({
  id,
  text: `text of ${id}`,
  title: "Information Security Policy",
  headingPath: ["Information Security Policy", "Encryption"],
  ...extra,
});
const lib = (id: string): LibraryHit => ({ id, question: `question ${id}`, answer: `answer ${id}` });
const rrf = (...ranks: number[]) => ranks.reduce((s, r) => s + 1 / (RRF_K + r), 0);

describe("mergeCandidates", () => {
  it("uses reciprocal rank fusion with k = 60", () => {
    expect(RRF_K).toBe(60);
    const out = mergeCandidates({
      vectorHits: [chunk("a"), chunk("b")],
      keywordHits: [chunk("b"), chunk("c")],
      libraryHits: [],
    });
    expect(out.map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(out[0].score).toBeCloseTo(rrf(2, 1), 12);
    expect(out[1].score).toBeCloseTo(rrf(1), 12);
    expect(out[2].score).toBeCloseTo(rrf(2), 12);
  });

  it("maps chunk and library hits to evidence", () => {
    const [c, l] = mergeCandidates({ vectorHits: [chunk("a")], keywordHits: [], libraryHits: [lib("q1")] });
    expect(c).toEqual({
      kind: "chunk",
      id: "a",
      text: "text of a",
      title: "Information Security Policy",
      headingPath: ["Information Security Policy", "Encryption"],
      score: rrf(1),
    });
    expect(l).toEqual({ kind: "library", id: "q1", text: "answer q1", title: "question q1", score: rrf(1) });
  });

  it("orders by score, chunks before library answers on ties, then by first appearance", () => {
    const out = mergeCandidates({
      vectorHits: [chunk("v1")],
      keywordHits: [chunk("k1")],
      libraryHits: [lib("l1"), lib("l2")],
    });
    expect(out.map((e) => e.id)).toEqual(["v1", "k1", "l1", "l2"]);
  });

  it("dedupes by id, counting only the best rank within a list", () => {
    const out = mergeCandidates({
      vectorHits: [chunk("a"), chunk("a"), chunk("b")],
      keywordHits: [chunk("a")],
      libraryHits: [lib("x"), lib("x"), lib("a")],
    });
    expect(out.map((e) => e.id)).toEqual(["a", "x", "b"]);
    expect(out[0].score).toBeCloseTo(rrf(1, 1), 12);
    expect(out.find((e) => e.id === "b")?.score).toBeCloseTo(rrf(3), 12);
    expect(out.filter((e) => e.id === "a")).toHaveLength(1);
    expect(out.find((e) => e.id === "a")?.kind).toBe("chunk");
  });

  it("caps at 8 chunk passages and 4 library answers", () => {
    const vectorHits = Array.from({ length: 10 }, (_, i) => chunk(`v${i}`));
    const keywordHits = Array.from({ length: 10 }, (_, i) => chunk(`k${i}`));
    const libraryHits = Array.from({ length: 6 }, (_, i) => lib(`l${i}`));
    const out = mergeCandidates({ vectorHits, keywordHits, libraryHits });
    expect(out.filter((e) => e.kind === "chunk")).toHaveLength(8);
    expect(out.filter((e) => e.kind === "library").map((e) => e.id)).toEqual(["l0", "l1", "l2", "l3"]);
  });

  it("keeps the best-ranked chunks when capping", () => {
    const vectorHits = Array.from({ length: 10 }, (_, i) => chunk(`c${i}`));
    const keywordHits = [chunk("c9")];
    const out = mergeCandidates({ vectorHits, keywordHits, libraryHits: [] }, { maxChunks: 3 });
    expect(out.map((e) => e.id)).toEqual(["c9", "c0", "c1"]);
  });

  it("returns nothing for empty inputs and skips empty text", () => {
    expect(mergeCandidates({ vectorHits: [], keywordHits: [], libraryHits: [] })).toEqual([]);
    const out = mergeCandidates({
      vectorHits: [chunk("blank", { text: "   " })],
      keywordHits: [],
      libraryHits: [{ id: "l", question: "q", answer: "" }],
    });
    expect(out).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const vectorHits = [chunk("a")];
    const snapshot = structuredClone(vectorHits);
    const out = mergeCandidates({ vectorHits, keywordHits: [], libraryHits: [] });
    out[0].headingPath?.push("mutated");
    expect(vectorHits).toEqual(snapshot);
  });
});
