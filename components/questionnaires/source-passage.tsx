import { FileText, Library } from "lucide-react";
import type { CitationRef } from "@/lib/db/types";
import type { CitationSource } from "@/lib/services/questionnaires";
import { cn } from "@/lib/utils";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` around the first occurrence of `quote`: exact
 * (case-insensitive) first, then word by word ignoring punctuation and
 * whitespace, the way the guardrails normalise quotes. Null when absent.
 */
export function splitOnQuote(text: string, quote: string): [string, string, string] | null {
  const q = quote.trim().replace(/^["“”']+|["“”']+$/g, "");
  if (!q) return null;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at >= 0) return [text.slice(0, at), text.slice(at, at + q.length), text.slice(at + q.length)];
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return null;
  const match = new RegExp(words.map(escapeRegExp).join("[^\\p{L}\\p{N}]+"), "iu").exec(text);
  if (!match) return null;
  return [text.slice(0, match.index), match[0], text.slice(match.index + match[0].length)];
}

export function HeadingPath({ parts, className }: { parts: string[]; className?: string }) {
  if (parts.length === 0) return null;
  return (
    <p className={cn("font-mono text-[0.6875rem] leading-relaxed break-words text-muted-foreground", className)}>
      {parts.map((part, i) => (
        <span key={`${i}-${part}`}>
          {i > 0 ? <span aria-hidden="true"> › </span> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

/**
 * The cited passage (design spec 6: moss-light `passage` block) with its
 * document title and heading path, and the quoted sentence highlighted.
 */
export function SourcePassage({
  citation,
  source,
  index,
  className,
}: {
  citation: CitationRef;
  source: CitationSource | undefined;
  /** 1-based marker number. */
  index: number;
  className?: string;
}) {
  if (!source) {
    return (
      <div className={cn("space-y-2", className)}>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          Citation <span className="cite">{index}</span>
        </p>
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Source removed. The document or library answer this citation pointed at was deleted.
        </p>
        {citation.quote ? (
          <blockquote className="border-l-2 border-border pl-3 text-[0.8125rem] text-foreground/80 italic">“{citation.quote}”</blockquote>
        ) : null}
      </div>
    );
  }

  const parts = splitOnQuote(source.text, citation.quote);
  const isLibrary = source.kind === "library";
  const trail = isLibrary ? [] : source.headingPath.filter((h, i) => !(i === 0 && h === source.title));

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {isLibrary ? <Library className="size-3.5 text-evergreen" aria-hidden /> : <FileText className="size-3.5 text-evergreen" aria-hidden />}
          <span className="min-w-0 truncate">{source.title}</span>
          <span className="cite ml-auto shrink-0">
            <span className="sr-only">citation </span>
            {index}
          </span>
        </p>
        {isLibrary ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Past answer to: <span className="text-foreground/85">{source.question}</span>
          </p>
        ) : (
          <HeadingPath parts={trail} className="mt-0.5" />
        )}
      </div>
      <blockquote className="passage max-h-[50svh] overflow-y-auto text-[0.8125rem] leading-relaxed whitespace-pre-line text-ink">
        {parts ? (
          <>
            {parts[0]}
            <mark className="bg-evergreen/15 text-ink underline decoration-evergreen decoration-2 underline-offset-[3px]">{parts[1]}</mark>
            {parts[2]}
          </>
        ) : (
          source.text
        )}
      </blockquote>
      {citation.quote && !parts ? (
        <p className="text-xs text-muted-foreground">
          Quoted: <span className="italic">“{citation.quote}”</span>
        </p>
      ) : null}
    </div>
  );
}
