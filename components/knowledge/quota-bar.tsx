import Link from "next/link";
import { formatNumber, pluralize } from "@/components/dashboard/format";
import type { KnowledgeStats } from "@/lib/services/knowledge";
import { WORDS_PER_PAGE } from "@/lib/services/plan-limits";
import { cn } from "@/lib/utils";

/** Knowledge-base size against the plan (Free: 25 pages of 500 words; demo documents excluded). */
export function QuotaBar({ stats }: { stats: KnowledgeStats }) {
  const { pagesUsed, pageLimit } = stats;
  const fraction = pageLimit ? Math.min(pagesUsed / pageLimit, 1) : 0;
  const nearLimit = pageLimit !== null && pagesUsed >= pageLimit * 0.8;

  return (
    <section aria-label="Knowledge base size" className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium">
          {pageLimit === null ? (
            <>
              <span className="tabular font-mono">{formatNumber(pagesUsed)}</span> pages · no limit on Pro
            </>
          ) : (
            <>
              <span className="tabular font-mono">{formatNumber(pagesUsed)}</span> of{" "}
              <span className="tabular font-mono">{formatNumber(pageLimit)}</span> pages used
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {pluralize(stats.documents, "document")} · {pluralize(stats.chunks, "chunk")}
          {stats.indexing > 0 ? ` · ${formatNumber(stats.indexing)} indexing` : ""}
          {stats.failed > 0 ? ` · ${formatNumber(stats.failed)} failed` : ""}
        </p>
      </div>
      {pageLimit !== null ? (
        <>
          <div
            role="meter"
            aria-label="Pages used"
            aria-valuemin={0}
            aria-valuemax={pageLimit}
            aria-valuenow={pagesUsed}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className={cn("h-full rounded-full", nearLimit ? "bg-amber" : "bg-evergreen")} style={{ width: `${fraction * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A page is {WORDS_PER_PAGE} words of extracted text. The demo workspace does not count.{" "}
            {nearLimit ? (
              <Link href="/billing" className="font-medium text-evergreen underline-offset-3 hover:underline">
                Pro has no page limit.
              </Link>
            ) : null}
          </p>
        </>
      ) : null}
    </section>
  );
}
