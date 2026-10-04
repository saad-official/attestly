/**
 * Headings-aware chunker (spec 3.1).
 *
 * - Sections start at Markdown headings #, ## and ### (h4+ stay body text;
 *   `#` lines inside code fences are not headings). Every chunk carries the
 *   nearest h1/h2/h3 titles as `headingPath`; heading lines are not repeated
 *   in the chunk text.
 * - Inside a section, blank-line paragraphs are packed greedily up to
 *   `maxTokens`. A paragraph that would overflow a chunk still below
 *   `minTokens` is split at sentence boundaries to fill it; a sentence longer
 *   than `maxTokens` is the only thing ever cut mid-sentence (word windows).
 * - Each following chunk of the same section starts with whole sentences from
 *   the previous chunk's tail, up to `overlapTokens` (the last `overlapTokens`
 *   worth of words if the final sentence alone is longer).
 * - Chunks under `minChunkTokens` are folded into the previous chunk when it
 *   has room (their own heading kept as a line so the fact is not lost);
 *   otherwise they are dropped, unless nothing else survives.
 *
 * Tokens are approximated as words x 1.3.
 */

export type Chunk = {
  /** 0-based order within the document. */
  position: number;
  headingPath: string[];
  text: string;
  tokenCount: number;
};

export type ChunkOptions = {
  minTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
  /** Chunks below this are folded into a neighbour or dropped. */
  minChunkTokens?: number;
};

const TOKENS_PER_WORD = 1.3;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const DEFAULTS: Required<ChunkOptions> = {
  minTokens: 400,
  maxTokens: 600,
  overlapTokens: 60,
  minChunkTokens: 20,
};

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function tokensForWords(words: number): number {
  return Math.ceil(words * TOKENS_PER_WORD);
}

export function estimateTokens(text: string): number {
  return tokensForWords(countWords(text));
}

/** Largest word count whose token estimate stays within `tokens`. */
function wordsWithin(tokens: number): number {
  let words = Math.floor(tokens / TOKENS_PER_WORD);
  while (words > 0 && tokensForWords(words) > tokens) words -= 1;
  return Math.max(1, words);
}

type Section = { headingPath: string[]; paragraphs: string[] };

const HEADING = /^ {0,3}(#{1,3})\s+(.+?)(?:\s+#+)?\s*$/;
const FENCE = /^ {0,3}(```|~~~)/;
const RULE = /^ {0,3}([-*_=])(?:\s*\1){2,}\s*$/;

function parseSections(text: string): Section[] {
  const lines = stripBom(text).replace(/\r\n?/g, "\n").split("\n");
  const sections: Section[] = [];
  let path: string[] = [];
  let current: Section = { headingPath: [], paragraphs: [] };
  let buffer: string[] = [];
  let inFence = false;

  const flushParagraph = () => {
    const paragraph = buffer.join("\n").trim();
    if (paragraph.length > 0) current.paragraphs.push(paragraph);
    buffer = [];
  };

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      buffer.push(line.trimEnd());
      continue;
    }
    if (inFence) {
      buffer.push(line.trimEnd());
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      if (current.paragraphs.length > 0) sections.push(current);
      const level = heading[1].length;
      path = [...path.slice(0, level - 1), heading[2].trim()];
      current = { headingPath: path, paragraphs: [] };
      continue;
    }
    if (line.trim() === "" || RULE.test(line)) {
      flushParagraph();
      continue;
    }
    buffer.push(line.trimEnd());
  }
  flushParagraph();
  if (current.paragraphs.length > 0) sections.push(current);
  return sections;
}

type Unit = {
  text: string;
  words: number;
  /** Joiner placed before this unit when it is not first in a chunk. */
  sep: string;
  /** Sentence-level pieces, when the unit is a multi-sentence paragraph. */
  parts?: Unit[];
};

const ABBREVIATION = /(?:^|\s)(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|inc|ltd|no|approx|cf|fig)\.$/i;
const SENTENCE_END = /[.!?]["')\]]*\s+(?=["'(\[]?[A-Z0-9])/g;

function splitLineIntoSentences(line: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const match of line.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].trimEnd().length;
    const candidate = line.slice(start, end);
    if (ABBREVIATION.test(candidate)) continue;
    out.push(candidate.trim());
    start = match.index + match[0].length;
  }
  const rest = line.slice(start).trim();
  if (rest.length > 0) out.push(rest);
  return out;
}

function wordWindows(sentence: string, maxWords: number, sep: string): Unit[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  const units: Unit[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const slice = words.slice(i, i + maxWords);
    units.push({ text: slice.join(" "), words: slice.length, sep: i === 0 ? sep : " " });
  }
  return units;
}

/** Sentence units for a paragraph; list lines and line breaks are boundaries too. */
function sentenceUnits(paragraph: string, maxWords: number): Unit[] {
  const units: Unit[] = [];
  paragraph.split("\n").forEach((line, lineIndex) => {
    splitLineIntoSentences(line).forEach((sentence, i) => {
      const sep = i > 0 ? " " : lineIndex > 0 ? "\n" : "";
      const words = countWords(sentence);
      if (words > maxWords) units.push(...wordWindows(sentence, maxWords, sep));
      else units.push({ text: sentence, words, sep });
    });
  });
  return units;
}

function paragraphUnits(paragraph: string, maxTokens: number): Unit[] {
  const maxWords = wordsWithin(maxTokens);
  const words = countWords(paragraph);
  const parts = sentenceUnits(paragraph, maxWords);
  if (parts.length > 0) parts[0] = { ...parts[0], sep: "\n\n" };
  if (words <= maxWords) {
    return [{ text: paragraph, words, sep: "\n\n", parts: parts.length > 1 ? parts : undefined }];
  }
  return parts;
}

function joinUnits(units: Unit[]): string {
  return units.map((u, i) => (i === 0 ? u.text : u.sep + u.text)).join("");
}

function overlapUnit(units: Unit[], overlapTokens: number): Unit | null {
  if (overlapTokens <= 0) return null;
  const pieces = units.flatMap((u) => u.parts ?? [u]);
  const taken: Unit[] = [];
  let words = 0;
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (tokensForWords(words + pieces[i].words) > overlapTokens) break;
    taken.unshift(pieces[i]);
    words += pieces[i].words;
  }
  if (taken.length === 0) {
    const last = pieces[pieces.length - 1];
    if (!last) return null;
    const tail = last.text.split(/\s+/).filter(Boolean).slice(-wordsWithin(overlapTokens));
    return { text: tail.join(" "), words: tail.length, sep: "" };
  }
  return { text: joinUnits(taken), words, sep: "" };
}

function packSection(section: Section, opts: Required<ChunkOptions>): string[] {
  const queue: Unit[] = section.paragraphs.flatMap((p) => paragraphUnits(p, opts.maxTokens));
  const texts: string[] = [];
  let current: Unit[] = [];
  let currentWords = 0;
  let overlapCount = 0;

  const fits = (words: number) => tokensForWords(words) <= opts.maxTokens;

  while (queue.length > 0) {
    const unit = queue.shift() as Unit;
    if (fits(currentWords + unit.words)) {
      current.push(unit);
      currentWords += unit.words;
      continue;
    }
    const onlyOverlap = current.length === overlapCount;
    if (unit.parts && (onlyOverlap || tokensForWords(currentWords) < opts.minTokens)) {
      queue.unshift(...unit.parts.map((p, i) => (i === 0 ? { ...p, sep: unit.sep } : p)));
      continue;
    }
    queue.unshift(unit);
    if (!onlyOverlap) {
      texts.push(joinUnits(current));
      const overlap = overlapUnit(current, opts.overlapTokens);
      current = overlap ? [overlap] : [];
      currentWords = overlap?.words ?? 0;
      overlapCount = current.length;
    } else {
      // The overlap plus an atomic unit would overflow: drop the overlap.
      current = [];
      currentWords = 0;
      overlapCount = 0;
    }
  }
  if (current.length > overlapCount) texts.push(joinUnits(current));
  return texts;
}

export function chunkDocument(text: string, options: ChunkOptions = {}): Chunk[] {
  const opts: Required<ChunkOptions> = { ...DEFAULTS, ...options };
  const raw = parseSections(text).flatMap((section) =>
    packSection(section, opts).map((t) => ({ headingPath: section.headingPath, text: t })),
  );

  const kept: Array<{ headingPath: string[]; text: string }> = [];
  for (const chunk of raw) {
    if (estimateTokens(chunk.text) >= opts.minChunkTokens) {
      kept.push({ ...chunk });
      continue;
    }
    const previous = kept[kept.length - 1];
    if (!previous) continue;
    const samePath = previous.headingPath.join("\u0000") === chunk.headingPath.join("\u0000");
    const leaf = chunk.headingPath[chunk.headingPath.length - 1];
    const addition = !samePath && leaf ? `${leaf}\n${chunk.text}` : chunk.text;
    const merged = `${previous.text}\n\n${addition}`;
    if (estimateTokens(merged) <= opts.maxTokens) previous.text = merged;
  }

  const final = kept.length > 0 ? kept : raw;
  return final.map((c, position) => ({
    position,
    headingPath: [...c.headingPath],
    text: c.text,
    tokenCount: estimateTokens(c.text),
  }));
}
