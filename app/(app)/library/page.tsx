import type { Metadata } from "next";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { formatNumber } from "@/components/dashboard/format";
import { AddAnswerDialog } from "@/components/library/add-answer-dialog";
import { ExportLibraryButton } from "@/components/library/export-button";
import { ImportCard } from "@/components/library/import-card";
import { LIBRARY_SOURCE_LABEL, LibraryList } from "@/components/library/library-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireOrgContext } from "@/lib/auth/session";
import { LIBRARY_SOURCES } from "@/lib/db/schema";
import type { LibrarySource } from "@/lib/db/types";
import { listLibrary } from "@/lib/services/library";
import { limitsFor } from "@/lib/services/plan-limits";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Answer library" };

const LIST_LIMIT = 500;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function hrefFor(search: string, source: LibrarySource | null): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (source) params.set("source", source);
  const qs = params.toString();
  return qs ? `/library?${qs}` : "/library";
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const { org } = await requireOrgContext();
  const params = await searchParams;
  const search = one(params.q).slice(0, 200);
  const sourceParam = one(params.source);
  const source = (LIBRARY_SOURCES as readonly string[]).includes(sourceParam) ? (sourceParam as LibrarySource) : null;

  const [answers, anyAnswers] = await Promise.all([
    listLibrary(org.id, { ...(search ? { search } : {}), ...(source ? { source } : {}), limit: LIST_LIMIT }),
    search || source ? listLibrary(org.id, { limit: 1 }) : null,
  ]);
  const libraryEmpty = search || source ? (anyAnswers?.length ?? 0) === 0 : answers.length === 0;
  const filtered = Boolean(search || source);

  return (
    <>
      <PageHeader
        title="Answer library"
        description="Past answers drafts can cite: imported questionnaires, answers you add by hand, and every answer approved in review."
        actions={
          <>
            <ExportLibraryButton allowed={limitsFor(org.plan).libraryExport} disabled={libraryEmpty} />
            <AddAnswerDialog />
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <form role="search" action="/library" method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {source ? <input type="hidden" name="source" value={source} /> : null}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Search questions and answers"
                aria-label="Search the library"
                className="pl-8"
                maxLength={200}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                Search
              </Button>
              {filtered ? (
                <Button asChild variant="ghost">
                  <Link href="/library">
                    <X aria-hidden />
                    Clear
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>

          <nav aria-label="Filter by source" className="flex flex-wrap gap-1.5">
            {[null, ...LIBRARY_SOURCES].map((s) => {
              const active = s === source;
              return (
                <Link
                  key={s ?? "all"}
                  href={hrefFor(search, s)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                    active ? "border-evergreen bg-evergreen text-evergreen-foreground" : "bg-card text-foreground/80 hover:bg-muted",
                  )}
                >
                  {s ? LIBRARY_SOURCE_LABEL[s] : "All sources"}
                </Link>
              );
            })}
          </nav>

          {libraryEmpty ? (
            <EmptyState
              title="The library is empty"
              description="Import a questionnaire you have answered before, or add answers by hand. Answers you approve in review are added automatically."
            />
          ) : answers.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
              No answers match{search ? ` “${search}”` : ""}
              {source ? ` from ${LIBRARY_SOURCE_LABEL[source].toLowerCase()}` : ""}.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {answers.length >= LIST_LIMIT
                  ? `Showing the newest ${formatNumber(LIST_LIMIT)} answers. Search to narrow the list.`
                  : `${formatNumber(answers.length)} ${answers.length === 1 ? "answer" : "answers"}${filtered ? " match" : ""}.`}
              </p>
              <LibraryList answers={answers} timeZone={org.timezone} />
            </>
          )}
        </div>
        <div className="order-1 lg:sticky lg:top-6 lg:order-2">
          <ImportCard />
        </div>
      </div>
    </>
  );
}
