import { cn } from "@/lib/utils";

/** Confidence as a number with a short bar. The number carries the meaning. */
export function Confidence({ value, className }: { value: number | null; className?: string }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span className={cn("font-mono text-xs text-muted-foreground", className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">No confidence score</span>
      </span>
    );
  }
  const clamped = Math.min(Math.max(value, 0), 1);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="tabular font-mono text-xs text-foreground">
        <span className="sr-only">Confidence </span>
        {clamped.toFixed(2)}
      </span>
      <span aria-hidden="true" className="relative h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", clamped >= 0.8 ? "bg-evergreen" : clamped >= 0.5 ? "bg-slate" : "bg-amber")}
          style={{ width: `${Math.round(clamped * 100)}%` }}
        />
      </span>
    </span>
  );
}
