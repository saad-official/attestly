import { cn } from "cn";

/**
 * Building blocks for the product mocks. The mocks are pictures of the app
 * drawn in HTML so they stay sharp, readable and translatable, but none of
 * their controls do anything, so nothing in them is focusable.
 */

export function Figure({
  number,
  caption,
  children,
  className,
}: {
  number: string;
  caption: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      {children}
      <figcaption className="mt-2.5 flex gap-3 text-xs leading-relaxed text-muted-foreground">
        <span className="shrink-0 font-mono font-medium text-foreground">Fig. {number}</span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/** App-style panel: white card, hairline border, the shadow token from globals. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-card", className)}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, meta }: { title: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-parchment px-3.5 py-2.5 sm:px-4">
      <p className="min-w-0 text-sm font-semibold">{title}</p>
      {meta ? <div className="font-mono text-[0.6875rem] text-muted-foreground">{meta}</div> : null}
    </div>
  );
}

/** Non-interactive stand-in for an app button. */
export function FauxButton({
  tone = "outline",
  children,
  className,
}: {
  tone?: "primary" | "outline" | "ghost";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[0.8125rem] font-medium whitespace-nowrap",
        tone === "primary" && "border-evergreen bg-evergreen text-evergreen-foreground",
        tone === "outline" && "border-border bg-background text-foreground",
        tone === "ghost" && "border-transparent text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Keyboard shortcut hint, as shown in the review grid. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-[3px] border border-border bg-background px-1 font-mono text-[0.625rem] leading-none text-foreground">
      {children}
    </kbd>
  );
}

/** Superscript citation marker, using the `cite` utility from globals. */
export function Cite({ n }: { n: number | string }) {
  return (
    <span className="cite">
      <span className="sr-only">citation </span>
      {n}
    </span>
  );
}

export type Status = "drafted" | "needs_evidence" | "approved" | "not_applicable";

const statusLabel: Record<Status, string> = {
  drafted: "Drafted",
  needs_evidence: "Needs evidence",
  approved: "Approved",
  not_applicable: "Not applicable",
};

/**
 * Status chip. Amber text fails contrast on white, so "needs evidence" uses
 * the dark amber foreground for its text and keeps amber for the dot and rule.
 * The dot is drawn by an unlayered ::before rule in globals, hence `!`.
 */
export function StatusChip({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "status-chip whitespace-nowrap",
        status === "drafted" && "bg-card text-evergreen",
        status === "approved" && "bg-approved/10 text-approved",
        status === "needs_evidence" && "border-amber! bg-amber/15 text-amber-foreground before:bg-amber!",
        status === "not_applicable" && "bg-card text-muted-foreground",
        className,
      )}
    >
      {statusLabel[status]}
    </span>
  );
}

/** Confidence as a number with a short bar. The number carries the meaning. */
export function Confidence({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No confidence: nothing to cite</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular font-mono text-xs text-foreground">{value.toFixed(2)}</span>
      <span aria-hidden="true" className="relative h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", value >= 0.8 ? "bg-evergreen" : "bg-slate")}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
    </span>
  );
}

/** "Document › 4.2 Heading" breadcrumb, the citation path used across the product. */
export function HeadingPath({ parts, className }: { parts: string[]; className?: string }) {
  return (
    <p className={cn("font-mono text-[0.6875rem] leading-relaxed text-muted-foreground", className)}>
      {parts.map((p, i) => (
        <span key={p}>
          {i > 0 ? (
            <span aria-hidden="true" className="px-1 text-foreground/40">
              ›
            </span>
          ) : null}
          {i > 0 ? <span className="sr-only">, section </span> : null}
          <span className={i === parts.length - 1 ? "text-foreground" : undefined}>{p}</span>
        </span>
      ))}
    </p>
  );
}

/** Pass/fail line from the guardrail checks, mono like a log. */
export function CheckLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 font-mono text-[0.6875rem] leading-relaxed">
      <span className="min-w-0 text-foreground/85">{children}</span>
      <span className={cn("shrink-0 font-medium", ok ? "text-approved" : "text-amber-foreground")}>
        {ok ? "pass" : "fail"}
      </span>
    </li>
  );
}
