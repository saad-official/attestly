import Link from "next/link";
import { formatDate } from "@/components/dashboard/format";
import type { LibraryAnswerSummary, LibrarySource } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { DeleteAnswerButton } from "./delete-answer-button";

export const LIBRARY_SOURCE_LABEL: Record<LibrarySource, string> = {
  import: "Imported",
  questionnaire: "Approved in a questionnaire",
  manual: "Added by hand",
};

const SOURCE_SHORT: Record<LibrarySource, string> = {
  import: "Import",
  questionnaire: "Questionnaire",
  manual: "Manual",
};

export function SourceBadge({ source, className }: { source: LibrarySource; className?: string }) {
  return (
    <span
      title={LIBRARY_SOURCE_LABEL[source]}
      className={cn(
        "inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[0.65rem] tracking-wide uppercase",
        source === "questionnaire" && "border-approved/40 bg-approved/10 text-approved",
        source === "import" && "border-evergreen/30 bg-moss-light/60 text-accent-foreground",
        source === "manual" && "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {SOURCE_SHORT[source]}
    </span>
  );
}

export function LibraryList({ answers, timeZone }: { answers: LibraryAnswerSummary[]; timeZone: string }) {
  return (
    <ul className="divide-y rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
      {answers.map((a) => (
        <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3">
          <p className="min-w-0 text-sm font-medium">{a.question}</p>
          <div className="row-span-2 flex items-start">
            <DeleteAnswerButton id={a.id} question={a.question} />
          </div>
          <details className="group min-w-0">
            <summary className="cursor-pointer list-none text-sm text-foreground/80 marker:hidden">
              <span className="line-clamp-2 whitespace-pre-line group-open:line-clamp-none">{a.answer}</span>
              {a.answer.length > 180 ? (
                <span className="mt-0.5 block text-xs font-medium text-evergreen">
                  <span className="group-open:hidden">Show full answer</span>
                  <span className="hidden group-open:inline">Show less</span>
                </span>
              ) : null}
            </summary>
          </details>
          <p className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <SourceBadge source={a.source} />
            <span>Approved {formatDate(a.approvedAt, timeZone)}</span>
            {a.questionnaireId ? (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={`/questionnaires/${a.questionnaireId}`}
                  className="font-medium text-evergreen underline-offset-3 hover:underline"
                >
                  Open questionnaire
                </Link>
              </>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
