import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { columnLetter, formatPercent } from "@/components/dashboard/format";
import { DeleteQuestionnaireButton } from "@/components/questionnaires/delete-questionnaire-button";
import { MappingForm, type MappingState } from "@/components/questionnaires/mapping-form";
import { requireOrgContext } from "@/lib/auth/session";
import { isNotFoundError, isServiceError } from "@/lib/services/errors";
import { FREE_QUESTIONS_PER_QUESTIONNAIRE } from "@/lib/services/plan-limits";
import { getMappingPreview, type MappingInput, type MappingPreview } from "@/lib/services/questionnaires";
import { isDemoQuestionnaire } from "@/lib/services/shared";
import { optionalColumn } from "../../../_lib/action-errors";

export const metadata: Metadata = { title: "Map columns" };

/** Confirming the mapping (a Server Action on this page) reads every row of the workbook. */
export const maxDuration = 60;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The user's edits from the URL; undefined when there are none (use detection). */
function mappingFromParams(params: Record<string, string | string[] | undefined>): MappingInput | undefined {
  const question = optionalColumn(one(params.q));
  if (question === undefined) return undefined;
  const header = Number(one(params.h));
  return {
    ...(Number.isInteger(header) && header >= 0 ? { headerRow: header } : {}),
    columns: {
      question,
      answer: optionalColumn(one(params.a)),
      comment: optionalColumn(one(params.c)),
      id: optionalColumn(one(params.i)),
    },
  };
}

export default async function MappingPage({ params, searchParams }: PageProps<"/questionnaires/[id]/mapping">) {
  const { org } = await requireOrgContext();
  const { id } = await params;
  const input = mappingFromParams(await searchParams);

  let preview: MappingPreview;
  let mappingError: string | null = null;
  try {
    preview = await getMappingPreview(org.id, id, input);
  } catch (error) {
    if (isNotFoundError(error)) notFound();
    if (!isServiceError(error) || !input) throw error;
    // The edited mapping is not valid (e.g. a removed sheet column): show detection instead.
    mappingError = error.message;
    try {
      preview = await getMappingPreview(org.id, id);
    } catch (fallback) {
      if (isNotFoundError(fallback)) notFound();
      throw fallback;
    }
  }

  const { questionnaire, mapping } = preview;
  if (questionnaire.status !== "mapping") redirect(`/questionnaires/${questionnaire.id}`);

  const state: MappingState = {
    sheetName: mapping.sheetName,
    headerRow: mapping.headerRow,
    question: mapping.columns.question,
    answer: mapping.columns.answer,
    comment: mapping.columns.comment,
    id: mapping.columns.id,
  };
  const overFreeLimit =
    org.plan === "free" && preview.questionCount > FREE_QUESTIONS_PER_QUESTIONNAIRE && !isDemoQuestionnaire(questionnaire);

  return (
    <>
      <Link
        href="/questionnaires"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-3 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Questionnaires
      </Link>
      <PageHeader
        title="Map the columns"
        description={
          <>
            <span className="font-medium text-foreground">{questionnaire.name}</span>
            {questionnaire.customer ? ` for ${questionnaire.customer}` : ""}. Check which column holds the questions and
            where answers go. Nothing is drafted until you confirm.
          </>
        }
        actions={<DeleteQuestionnaireButton questionnaireId={questionnaire.id} name={questionnaire.name} label="Discard upload" />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-labelledby="mapping-title" className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10">
          <h2 id="mapping-title" className="text-base">
            Detected layout
          </h2>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">File</dt>
            <dd className="truncate font-mono text-xs leading-5">{questionnaire.fileName}</dd>
            <dt className="text-muted-foreground">Sheet</dt>
            <dd className="truncate font-mono text-xs leading-5">
              {preview.format === "csv" ? "CSV (one sheet)" : mapping.sheetName}
            </dd>
            <dt className="text-muted-foreground">Confidence</dt>
            <dd className="tabular font-mono text-xs leading-5">{formatPercent(mapping.confidence)}</dd>
            {mapping.sections.length > 0 ? (
              <>
                <dt className="text-muted-foreground">Sections</dt>
                <dd className="tabular font-mono text-xs leading-5">{mapping.sections.length}</dd>
              </>
            ) : null}
          </dl>
          {mapping.warnings.length > 0 || mappingError ? (
            <ul className="mt-3 grid gap-1.5">
              {mappingError ? (
                <li className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {mappingError} Showing the detected mapping instead.
                </li>
              ) : null}
              {mapping.warnings.map((w) => (
                <li
                  key={w}
                  className="flex gap-2 rounded-lg border border-amber/60 bg-amber/10 px-2.5 py-1.5 text-xs text-amber-foreground dark:text-amber"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          ) : null}
          {overFreeLimit ? (
            <p className="mt-3 rounded-lg border border-amber/60 bg-amber/10 px-2.5 py-1.5 text-xs text-amber-foreground dark:text-amber">
              This mapping reads {preview.questionCount} questions; the Free plan handles up to {FREE_QUESTIONS_PER_QUESTIONNAIRE}.{" "}
              <Link href="/billing" className="font-medium underline underline-offset-3">
                Upgrade to Pro
              </Link>{" "}
              or adjust the mapping.
            </p>
          ) : null}
          <div className="mt-4 border-t pt-4">
            <MappingForm
              questionnaireId={questionnaire.id}
              mapping={state}
              headers={mapping.headers}
              questionCount={preview.questionCount}
            />
          </div>
        </section>

        <section aria-labelledby="preview-title" className="min-w-0 rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
            <h2 id="preview-title" className="text-base">
              Preview
            </h2>
            <p className="text-xs text-muted-foreground">
              First {preview.preview.length} of {preview.questionCount} questions as they will be read.
            </p>
          </header>
          {preview.preview.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No questions found with this mapping. Try another question column or header row.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-mono text-[0.65rem] tracking-[0.06em] text-muted-foreground uppercase">
                    <th scope="col" className="w-14 px-3 py-2 font-medium">
                      Row
                    </th>
                    {mapping.columns.id !== undefined ? (
                      <th scope="col" className="w-20 px-3 py-2 font-medium">
                        ID · {columnLetter(mapping.columns.id)}
                      </th>
                    ) : null}
                    <th scope="col" className="w-36 px-3 py-2 font-medium">
                      Section
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Question · {columnLetter(mapping.columns.question)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row) => (
                    <tr key={row.rowNumber} className="border-b align-top last:border-b-0">
                      <td className="tabular px-3 py-2 font-mono text-xs text-muted-foreground">{row.rowNumber}</td>
                      {mapping.columns.id !== undefined ? (
                        <td className="px-3 py-2 font-mono text-xs">{row.externalId ?? "—"}</td>
                      ) : null}
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.section ?? "—"}</td>
                      <td className="px-3 py-2">{row.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {mapping.headers.length > 0 ? (
            <footer className="border-t px-4 py-3">
              <p className="font-mono text-[0.65rem] tracking-[0.06em] text-muted-foreground uppercase">
                Header row {mapping.headerRow}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {mapping.headers.map((h) => (
                  <span key={h.column} className="rounded-sm border bg-muted/40 px-1.5 py-0.5 font-mono text-[0.6875rem]">
                    {columnLetter(h.column)} · {h.label}
                  </span>
                ))}
              </p>
            </footer>
          ) : null}
        </section>
      </div>
    </>
  );
}
