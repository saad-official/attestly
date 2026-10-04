import Link from "next/link";
import type { QuestionStatus } from "@/lib/db/types";
import type { QuestionCounts } from "@/lib/services/questionnaires";
import { cn } from "@/lib/utils";
import { QUESTION_STATUS_LABEL } from "./status-chip";

const ORDER: QuestionStatus[] = ["drafted", "needs_evidence", "approved", "not_applicable", "pending"];

const COUNT_TONE: Partial<Record<QuestionStatus, string>> = {
  needs_evidence: "text-amber-foreground dark:text-amber",
  approved: "text-approved",
};

/** Filter chips for the review grid (`?status=`), with counts. */
export function StatusFilter({
  questionnaireId,
  counts,
  current,
}: {
  questionnaireId: string;
  counts: QuestionCounts;
  current: QuestionStatus | null;
}) {
  const base = `/questionnaires/${questionnaireId}`;
  const chips: Array<{ status: QuestionStatus | null; label: string; count: number }> = [
    { status: null, label: "All", count: counts.total },
    ...ORDER.filter((s) => s !== "pending" || counts.pending > 0 || current === "pending").map((s) => ({
      status: s,
      label: QUESTION_STATUS_LABEL[s],
      count: counts[s],
    })),
  ];
  return (
    <nav aria-label="Filter questions by status" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const active = chip.status === current;
        return (
          <Link
            key={chip.status ?? "all"}
            href={chip.status ? `${base}?status=${chip.status}` : base}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              active ? "border-evergreen bg-evergreen text-evergreen-foreground" : "bg-card text-foreground/80 hover:bg-muted",
            )}
          >
            {chip.label}
            <span className={cn("tabular font-mono", active ? "text-evergreen-foreground/80" : COUNT_TONE[chip.status ?? "pending"] ?? "text-muted-foreground")}>
              {chip.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
