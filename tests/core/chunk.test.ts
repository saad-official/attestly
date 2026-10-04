import { describe, expect, it } from "vitest";
import { chunkDocument, estimateTokens } from "@/lib/ingest/chunk";

/** A 10-word sentence tagged with a unique marker, e.g. "Control s12 ...". */
function sentence(tag: string): string {
  return `Control ${tag} requires owners to document review evidence every quarter.`;
}

function paragraph(prefix: string, sentences: number): string {
  return Array.from({ length: sentences }, (_, i) => sentence(`${prefix}${i}`)).join(" ");
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("estimateTokens", () => {
  it("approximates tokens as words x 1.3, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("one two three")).toBe(4);
    expect(estimateTokens(sentence("x"))).toBe(13);
  });
});

describe("chunkDocument: headings", () => {
  const doc = [
    "# Access Control Policy",
    paragraph("a", 3),
    "## Authentication",
    paragraph("b", 3),
    "### Multi-factor authentication",
    paragraph("c", 3),
    "## Access reviews",
    paragraph("d", 3),
    "# Incident Response Plan",
    paragraph("e", 3),
  ].join("\n\n");

  const chunks = chunkDocument(doc);

  it("keeps the nearest h1/h2/h3 path on every chunk", () => {
    expect(chunks.map((c) => c.headingPath)).toEqual([
      ["Access Control Policy"],
      ["Access Control Policy", "Authentication"],
      ["Access Control Policy", "Authentication", "Multi-factor authentication"],
      ["Access Control Policy", "Access reviews"],
      ["Incident Response Plan"],
    ]);
  });

  it("splits on headings, numbers positions and keeps heading lines out of the body", () => {
    expect(chunks.map((c) => c.position)).toEqual([0, 1, 2, 3, 4]);
    expect(chunks[2].text).toBe(paragraph("c", 3));
    for (const c of chunks) expect(c.text).not.toMatch(/^#/m);
  });

  it("does not carry overlap across a heading", () => {
    expect(chunks[1].text.startsWith(sentence("b0"))).toBe(true);
  });

  it("reports token counts with the words x 1.3 estimate", () => {
    expect(chunks[0].tokenCount).toBe(estimateTokens(chunks[0].text));
  });

  it("treats h4+ as body text and ignores # lines inside code fences", () => {
    const out = chunkDocument(
      ["# Top", paragraph("f", 2), "#### Minor heading", "```", "# not a heading", "```", paragraph("g", 2)].join("\n\n"),
    );
    expect(out).toHaveLength(1);
    expect(out[0].headingPath).toEqual(["Top"]);
    expect(out[0].text).toContain("#### Minor heading");
    expect(out[0].text).toContain("# not a heading");
  });

  it("strips trailing #s and emphasis-free whitespace from headings", () => {
    const out = chunkDocument(`##   Data retention  ##\n\n${paragraph("h", 3)}`);
    expect(out[0].headingPath).toEqual(["Data retention"]);
  });
});

describe("chunkDocument: sizes and overlap", () => {
  // 30 paragraphs x 5 sentences x 13 tokens ~ 1950 tokens.
  const long = Array.from({ length: 30 }, (_, i) => paragraph(`p${i}x`, 5)).join("\n\n");
  const chunks = chunkDocument(`# Policy\n\n${long}`);

  it("produces chunks inside the 400-600 token target (last may be shorter)", () => {
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(600);
    for (const c of chunks.slice(0, -1)) expect(c.tokenCount).toBeGreaterThanOrEqual(400);
  });

  it("starts each following chunk with up to 60 tokens from the previous chunk's tail", () => {
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1].text;
      const firstSentence = chunks[i].text.match(/^[^.]*\./)?.[0] ?? "";
      expect(firstSentence.length).toBeGreaterThan(0);
      expect(prev.endsWith(firstSentence) || prev.includes(firstSentence)).toBe(true);
      // The overlap is whole sentences totalling <= 60 tokens: here 4 sentences of 13 tokens.
      const overlap = chunks[i].text.split(/(?<=\.)\s+/).filter((s) => prev.includes(s));
      const overlapTokens = estimateTokens(overlap.join(" "));
      expect(overlapTokens).toBeGreaterThan(0);
      expect(overlapTokens).toBeLessThanOrEqual(60);
      expect(prev.endsWith(overlap[overlap.length - 1])).toBe(true);
    }
  });

  it("never ends a chunk mid-sentence when sentences fit", () => {
    for (const c of chunks) expect(c.text.trim().endsWith(".")).toBe(true);
  });

  it("loses no sentence", () => {
    const all = chunks.map((c) => c.text).join(" ");
    for (let i = 0; i < 30; i++) for (let j = 0; j < 5; j++) expect(all).toContain(sentence(`p${i}x${j}`));
  });

  it("splits one very long paragraph at sentence boundaries", () => {
    const out = chunkDocument(paragraph("q", 100)); // ~1300 tokens, no blank lines
    expect(out.length).toBeGreaterThanOrEqual(3);
    for (const c of out) {
      expect(c.tokenCount).toBeLessThanOrEqual(600);
      expect(c.text.endsWith(".")).toBe(true);
    }
    for (const c of out.slice(0, -1)) expect(c.tokenCount).toBeGreaterThanOrEqual(400);
  });

  it("falls back to word windows for a run-on sentence longer than the maximum", () => {
    const runOn = Array.from({ length: 800 }, (_, i) => `w${i}`).join(" ");
    const out = chunkDocument(runOn);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.tokenCount).toBeLessThanOrEqual(600);
    expect(out[out.length - 1].text).toContain("w799");
  });

  it("honours custom size options", () => {
    const out = chunkDocument(paragraph("r", 30), { minTokens: 100, maxTokens: 150, overlapTokens: 20 });
    for (const c of out) expect(c.tokenCount).toBeLessThanOrEqual(150);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });
});

describe("chunkDocument: plain text and small fragments", () => {
  it("chunks plain text without headings with an empty heading path", () => {
    const text = [paragraph("s", 3), paragraph("t", 3)].join("\n\n");
    const out = chunkDocument(text);
    expect(out).toHaveLength(1);
    expect(out[0].headingPath).toEqual([]);
    expect(out[0].text).toBe(text);
  });

  it("normalises CRLF and collapses runs of blank lines between paragraphs", () => {
    const out = chunkDocument(`${paragraph("u", 2)}\r\n\r\n\r\n\r\n${paragraph("v", 2)}`);
    expect(out[0].text).toBe(`${paragraph("u", 2)}\n\n${paragraph("v", 2)}`);
  });

  it("drops fragments under 20 tokens that have no neighbour to join", () => {
    const out = chunkDocument(`Confidential, internal use.\n\n# Policy\n\n${paragraph("w", 3)}`);
    expect(out).toHaveLength(1);
    expect(out[0].headingPath).toEqual(["Policy"]);
    expect(out[0].text).not.toContain("Confidential");
  });

  it("keeps a tiny document when it is the only content", () => {
    const out = chunkDocument("# Note\n\nMFA everywhere.");
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("MFA everywhere.");
    expect(out[0].headingPath).toEqual(["Note"]);
  });

  it("folds a tiny section into the previous chunk, keeping its heading as a line", () => {
    const out = chunkDocument(`# Backups\n\n${paragraph("x", 3)}\n\n## Retention\n\nBackups are kept for 35 days.`);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("Retention\nBackups are kept for 35 days.");
    expect(out[0].headingPath).toEqual(["Backups"]);
  });

  it("ignores horizontal rules and returns nothing for empty input", () => {
    expect(chunkDocument("")).toEqual([]);
    expect(chunkDocument("  \n\n---\n\n")).toEqual([]);
    const out = chunkDocument(`${paragraph("y", 2)}\n\n---\n\n${paragraph("z", 2)}`);
    expect(out[0].text).not.toContain("---");
    expect(wordCount(out[0].text)).toBe(40);
  });
});
