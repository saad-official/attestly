import { cn } from "cn";

/**
 * The marketing page holds itself to the product's rule: every figure cites
 * its source. Markers are in-page links to the numbered source list.
 */

export const sources = [
  {
    id: "source-1",
    n: 1,
    text: "Wolfia, March 2026.",
  },
  {
    id: "source-2",
    n: 2,
    text: "Procurize, 2026.",
  },
] as const;

export function SourceMarker({ n }: { n: 1 | 2 }) {
  return (
    <a
      href={`#source-${n}`}
      className={cn(
        "cite no-underline outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-evergreen",
      )}
    >
      <span className="sr-only">source </span>
      {n}
    </a>
  );
}

export function SourceList({ className }: { className?: string }) {
  return (
    <ol className={cn("space-y-1 font-mono text-[0.6875rem] leading-relaxed text-muted-foreground", className)}>
      {sources.map((s) => (
        <li key={s.id} id={s.id} className="flex scroll-mt-6 gap-2 target:text-foreground">
          <span className="tabular shrink-0 text-evergreen">[{s.n}]</span>
          <span>
            {s.text} Vendor-published figure, not independently verified.
          </span>
        </li>
      ))}
    </ol>
  );
}
