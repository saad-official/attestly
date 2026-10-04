import Link from "next/link";
import type { KnowledgeGap } from "@/lib/services/questionnaires";
import { formatNumber } from "./format";

const MAX_GAPS = 8;

/**
 * Clusters of needs-evidence questions (spec 3.6): which policy to write
 * next. Each links to the questionnaire filtered to needs evidence.
 */
export function KnowledgeGaps({ gaps, error }: { gaps: KnowledgeGap[]; error: string | null }) {
  const shown = gaps.slice(0, MAX_GAPS);
  return (
    <section aria-labelledby="gaps-title" className="rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
      <header className="border-b px-4 py-3">
        <h2 id="gaps-title" className="text-base">
          Knowledge gaps
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Questions no document answers, grouped by topic. Write or upload the policy, then re-draft.
        </p>
      </header>
      {error ? (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">Grouping is unavailable right now; gaps are listed one by one.</p>
      ) : null}
      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No gaps. Every drafted question found supporting evidence.
        </p>
      ) : (
        <ul className="divide-y">
          {shown.map((gap) => {
            const questionnaires = new Map<string, string>();
            for (const q of gap.questions) questionnaires.set(q.questionnaireId, q.questionnaireName);
            const note = gap.questions.find((q) => q.notes?.trim())?.notes ?? null;
            return (
              <li key={gap.questionIds[0]} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium">{gap.label}</p>
                  <span
                    className="tabular inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber/20 px-1.5 font-mono text-xs font-semibold text-amber-foreground dark:text-amber"
                    aria-label={`${gap.count} ${gap.count === 1 ? "question" : "questions"}`}
                  >
                    {formatNumber(gap.count)}
                  </span>
                </div>
                {note ? (
                  <p className="mt-1 border-l-2 border-amber pl-2 text-xs leading-snug text-muted-foreground">{note}</p>
                ) : null}
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {[...questionnaires].map(([id, name]) => (
                    <Link
                      key={id}
                      href={`/questionnaires/${id}?status=needs_evidence`}
                      className="max-w-full truncate font-medium text-evergreen underline-offset-3 hover:underline"
                    >
                      {name}
                    </Link>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {gaps.length > MAX_GAPS ? (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {formatNumber(gaps.length - MAX_GAPS)} smaller gaps not shown.
        </p>
      ) : null}
    </section>
  );
}
