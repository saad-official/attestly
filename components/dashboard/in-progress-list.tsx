import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CompletionBar } from "@/components/questionnaires/completion-bar";
import { QuestionnaireStatusChip } from "@/components/questionnaires/status-chip";
import type { QuestionnaireProgress } from "@/lib/services/metrics";
import { formatDate, formatNumber } from "./format";

export function questionnaireHref(q: { id: string; status: QuestionnaireProgress["status"] }): string {
  return q.status === "mapping" ? `/questionnaires/${q.id}/mapping` : `/questionnaires/${q.id}`;
}

/** Questionnaires not yet done, with their coverage. */
export function InProgressList({ items, timeZone }: { items: QuestionnaireProgress[]; timeZone: string }) {
  return (
    <section aria-labelledby="in-progress-title" className="rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="in-progress-title" className="text-base">
          In progress
        </h2>
        <Link href="/questionnaires" className="text-sm font-medium text-evergreen underline-offset-3 hover:underline">
          All questionnaires
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing in progress. Upload a customer questionnaire to start drafting.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((q) => (
            <li key={q.id}>
              <Link
                href={questionnaireHref(q)}
                className="group grid gap-2 px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-medium">{q.name}</span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <QuestionnaireStatusChip status={q.status} className="text-[0.7rem]" />
                    {q.customer ? <span className="truncate">{q.customer}</span> : null}
                    <span className="tabular font-mono">
                      {q.status === "mapping"
                        ? "mapping not confirmed"
                        : q.status === "drafting"
                          ? `${formatNumber(q.draftedCount)} of ${formatNumber(q.questionCount)} drafted`
                          : `${formatNumber(q.approvedCount)} of ${formatNumber(q.questionCount)} approved`}
                    </span>
                    {q.needsEvidenceCount > 0 ? (
                      <span className="tabular font-mono text-amber-foreground dark:text-amber">
                        {formatNumber(q.needsEvidenceCount)} need evidence
                      </span>
                    ) : null}
                    <span>· {formatDate(q.createdAt, timeZone)}</span>
                  </p>
                </div>
                <CompletionBar
                  segments={{
                    total: q.questionCount,
                    approved: q.approvedCount,
                    notApplicable: q.notApplicableCount,
                    drafted: q.awaitingReviewCount,
                    needsEvidence: q.needsEvidenceCount,
                  }}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
