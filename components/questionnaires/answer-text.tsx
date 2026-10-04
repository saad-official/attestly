"use client";

import type { CitationRef } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * An answer followed by its citation markers. The model's answer text has
 * no inline markers, so `[1]`, `[2]`… are appended in citation order; each
 * opens its source passage.
 */
export function AnswerText({
  text,
  citations,
  onCite,
  activeIndex,
  clamp = false,
  className,
}: {
  text: string;
  citations: CitationRef[];
  onCite?: (index: number) => void;
  /** 0-based index of the citation currently shown, if any. */
  activeIndex?: number | null;
  clamp?: boolean;
  className?: string;
}) {
  return (
    <p className={cn("whitespace-pre-line", clamp && "line-clamp-3", className)}>
      {text}
      {citations.map((c, i) =>
        onCite ? (
          <button
            key={`${i}-${c.chunkId ?? c.libraryAnswerId ?? ""}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCite(i);
            }}
            className={cn(
              "cite cursor-pointer transition-opacity outline-none hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              activeIndex === i && "ring-2 ring-evergreen/40 ring-offset-1",
            )}
            aria-label={`Show source for citation ${i + 1}`}
            title={c.quote ? `“${c.quote}”` : undefined}
          >
            {i + 1}
          </button>
        ) : (
          <span key={`${i}-${c.chunkId ?? c.libraryAnswerId ?? ""}`} className="cite">
            <span className="sr-only">citation </span>
            {i + 1}
          </span>
        ),
      )}
    </p>
  );
}
