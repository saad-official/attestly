import { cn } from "@/lib/utils";
import { formatPercent } from "@/components/dashboard/format";

export type CompletionSegments = {
  total: number;
  approved: number;
  notApplicable?: number;
  /** Drafted and waiting for review. */
  drafted?: number;
  needsEvidence?: number;
};

/**
 * Stacked coverage bar: approved (green), not applicable (slate), drafted
 * (evergreen, lighter), needs evidence (amber); the rest is pending. The
 * percentage is approved + not applicable over all questions.
 */
export function CompletionBar({
  segments,
  className,
  showLabel = true,
}: {
  segments: CompletionSegments;
  className?: string;
  showLabel?: boolean;
}) {
  const { total, approved, notApplicable = 0, drafted = 0, needsEvidence = 0 } = segments;
  const done = total === 0 ? 0 : (approved + notApplicable) / total;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const parts = [
    { key: "approved", width: pct(approved), className: "bg-approved" },
    { key: "na", width: pct(notApplicable), className: "bg-slate/60" },
    { key: "drafted", width: pct(drafted), className: "bg-evergreen/45" },
    { key: "needs", width: pct(needsEvidence), className: "bg-amber" },
  ].filter((p) => p.width > 0);

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        role="meter"
        aria-label="Completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(done * 100)}
        aria-valuetext={`${formatPercent(done)} complete: ${approved} approved${
          notApplicable ? `, ${notApplicable} not applicable` : ""
        }${drafted ? `, ${drafted} drafted` : ""}${needsEvidence ? `, ${needsEvidence} need evidence` : ""} of ${total}`}
        className="flex h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted"
      >
        {parts.map((p) => (
          <span key={p.key} className={cn("h-full", p.className)} style={{ width: `${p.width}%` }} />
        ))}
      </div>
      {showLabel ? <span className="tabular w-9 shrink-0 text-right font-mono text-xs text-muted-foreground">{formatPercent(done)}</span> : null}
    </div>
  );
}

/** Legend for the coverage bar colours. */
export function CompletionLegend({ className }: { className?: string }) {
  const item = "inline-flex items-center gap-1.5";
  const dot = "size-2 rounded-full";
  return (
    <p className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className={item}>
        <span className={cn(dot, "bg-approved")} aria-hidden /> Approved
      </span>
      <span className={item}>
        <span className={cn(dot, "bg-slate/60")} aria-hidden /> Not applicable
      </span>
      <span className={item}>
        <span className={cn(dot, "bg-evergreen/45")} aria-hidden /> Drafted
      </span>
      <span className={item}>
        <span className={cn(dot, "bg-amber")} aria-hidden /> Needs evidence
      </span>
    </p>
  );
}
