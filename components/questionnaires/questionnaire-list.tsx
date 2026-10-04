import Link from "next/link";
import { questionnaireHref } from "@/components/dashboard/in-progress-list";
import { formatDate, formatNumber } from "@/components/dashboard/format";
import type { QuestionnaireSummary } from "@/lib/db/types";
import { CompletionBar } from "./completion-bar";
import { QuestionnaireStatusChip } from "./status-chip";

const th = "sticky top-0 z-10 border-b bg-card px-3 py-2 text-left font-mono text-[0.65rem] font-medium tracking-[0.06em] text-muted-foreground uppercase";

/**
 * Every questionnaire, newest first. A table from md up; stacked rows below.
 * The summary carries approved and needs-evidence counts (not "not
 * applicable"), so completion here is approved over all questions.
 */
export function QuestionnaireList({ items, timeZone }: { items: QuestionnaireSummary[]; timeZone: string }) {
  return (
    <div className="rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:block">
        <caption className="sr-only">Questionnaires</caption>
        <colgroup>
          <col />
          <col className="w-28" />
          <col className="w-28" />
          <col className="w-40" />
          <col className="w-28" />
        </colgroup>
        <thead className="max-md:hidden">
          <tr>
            <th scope="col" className={`${th} rounded-tl-xl pl-4`}>
              Questionnaire
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={`${th} text-right`}>
              Questions
            </th>
            <th scope="col" className={th}>
              Approved
            </th>
            <th scope="col" className={`${th} rounded-tr-xl pr-4`}>
              Created
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block max-md:divide-y">
          {items.map((q) => {
            const drafted = Math.max(q.draftedCount - q.approvedCount - q.needsEvidenceCount, 0);
            return (
              <tr key={q.id} className="group hover:bg-muted/30 max-md:grid max-md:grid-cols-[minmax(0,1fr)] max-md:gap-1.5 max-md:px-4 max-md:py-3">
                <td className="border-b px-3 py-2.5 pl-4 align-top group-last:border-b-0 max-md:border-0 max-md:p-0">
                  <Link
                    href={questionnaireHref(q)}
                    className="line-clamp-2 font-medium break-words underline-offset-3 group-hover:underline focus-visible:underline"
                  >
                    {q.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {q.customer ? `${q.customer} · ` : ""}
                    <span className="font-mono">{q.fileName}</span>
                  </p>
                </td>
                <td className="border-b px-3 py-2.5 align-top group-last:border-b-0 max-md:border-0 max-md:p-0">
                  <QuestionnaireStatusChip status={q.status} className="text-[0.7rem]" />
                </td>
                <td className="tabular border-b px-3 py-2.5 text-right align-top font-mono text-xs group-last:border-b-0 max-md:border-0 max-md:p-0 max-md:text-left">
                  {q.status === "mapping" ? (
                    <span className="text-muted-foreground">not mapped</span>
                  ) : (
                    <>
                      {formatNumber(q.questionCount)}
                      <span className="md:hidden"> questions</span>
                      {q.needsEvidenceCount > 0 ? (
                        <span className="block text-amber-foreground max-md:ml-2 max-md:inline dark:text-amber">
                          {formatNumber(q.needsEvidenceCount)} need evidence
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="border-b px-3 py-2.5 align-top group-last:border-b-0 max-md:border-0 max-md:p-0">
                  {q.status === "mapping" ? null : (
                    <>
                      <CompletionBar
                        segments={{
                          total: q.questionCount,
                          approved: q.approvedCount,
                          drafted,
                          needsEvidence: q.needsEvidenceCount,
                        }}
                      />
                      <p className="tabular mt-0.5 font-mono text-[0.65rem] text-muted-foreground">
                        {formatNumber(q.approvedCount)} of {formatNumber(q.questionCount)} approved
                      </p>
                    </>
                  )}
                </td>
                <td className="border-b px-3 py-2.5 pr-4 align-top text-xs whitespace-nowrap text-muted-foreground group-last:border-b-0 max-md:border-0 max-md:p-0">
                  {formatDate(q.createdAt, timeZone)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
