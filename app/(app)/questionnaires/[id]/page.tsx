import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatNumber } from "@/components/dashboard/format";
import { BulkApprove } from "@/components/questionnaires/bulk-approve";
import { CompletionBar, CompletionLegend } from "@/components/questionnaires/completion-bar";
import { DeleteQuestionnaireButton } from "@/components/questionnaires/delete-questionnaire-button";
import { DraftRunner } from "@/components/questionnaires/draft-runner";
import { ExportButtons } from "@/components/questionnaires/export-buttons";
import { ReviewGrid } from "@/components/questionnaires/review-grid";
import { ShareDialog, type ShareLinkView } from "@/components/questionnaires/share-dialog";
import { QUESTION_STATUS_LABEL, QuestionnaireStatusChip } from "@/components/questionnaires/status-chip";
import { StatusFilter } from "@/components/questionnaires/status-filter";
import { pickSources, toGridRow } from "@/components/questionnaires/types";
import { requireOrgContext } from "@/lib/auth/session";
import { QUESTION_STATUSES } from "@/lib/db/schema";
import type { QuestionStatus } from "@/lib/db/types";
import { limitsFor } from "@/lib/services/plan-limits";
import { getQuestionnaireDetail, listShareLinks } from "@/lib/services/questionnaires";

export const metadata: Metadata = { title: "Review" };

/** Bulk approve embeds every approved question for the library. */
export const maxDuration = 60;

function requestTime(): number {
  return Date.now();
}

export default async function ReviewPage({ params, searchParams }: PageProps<"/questionnaires/[id]">) {
  const { org } = await requireOrgContext();
  const { id } = await params;
  const { status: statusParam } = await searchParams;

  const detail = await getQuestionnaireDetail(org.id, id);
  if (!detail) notFound();
  const { questionnaire, counts } = detail;
  if (questionnaire.status === "mapping") redirect(`/questionnaires/${questionnaire.id}/mapping`);

  const limits = limitsFor(org.plan);
  const statusValue = Array.isArray(statusParam) ? statusParam[0] : statusParam;
  const filter = (QUESTION_STATUSES as readonly string[]).includes(statusValue ?? "") ? (statusValue as QuestionStatus) : null;

  const allRows = detail.questions.map(toGridRow);
  const rows = filter ? allRows.filter((r) => r.status === filter) : allRows;
  const sources = pickSources(rows, detail.sourcesById);
  const draftedConfidences = allRows
    .filter((r) => r.status === "drafted" && r.confidence !== null)
    .map((r) => r.confidence as number);

  const now = requestTime();
  const shareLinks: ShareLinkView[] = limits.shareLinks
    ? (await listShareLinks(org.id, questionnaire.id)).map((l) => ({
        id: l.id,
        path: l.path,
        expiresAt: l.expiresAt,
        expired: l.expiresAt.getTime() <= now,
      }))
    : [];

  const drafted = counts.total - counts.pending;
  const drafting = questionnaire.status === "drafting";

  return (
    <>
      <Link
        href="/questionnaires"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-3 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Questionnaires
      </Link>

      <header className="flex flex-col gap-4 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">{questionnaire.name}</h1>
            <QuestionnaireStatusChip status={questionnaire.status} />
          </div>
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {questionnaire.customer ? <span className="text-foreground/85">{questionnaire.customer}</span> : null}
            {questionnaire.customer ? <span aria-hidden>·</span> : null}
            <span className="font-mono text-xs leading-5">{questionnaire.fileName}</span>
            <span aria-hidden>·</span>
            <span>uploaded {formatDate(questionnaire.createdAt, org.timezone)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons questionnaireId={questionnaire.id} xlsxAllowed={limits.xlsxExport} />
          <ShareDialog questionnaireId={questionnaire.id} allowed={limits.shareLinks} links={shareLinks} timeZone={org.timezone} />
          <DeleteQuestionnaireButton questionnaireId={questionnaire.id} name={questionnaire.name} />
        </div>
      </header>

      <section aria-label="Coverage" className="mb-5 grid gap-3 rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
          {[
            { label: "Questions", value: counts.total, tone: "" },
            { label: "Drafted", value: drafted, tone: "" },
            { label: QUESTION_STATUS_LABEL.needs_evidence, value: counts.needs_evidence, tone: counts.needs_evidence > 0 ? "text-amber-foreground dark:text-amber" : "" },
            { label: QUESTION_STATUS_LABEL.approved, value: counts.approved, tone: counts.approved > 0 ? "text-approved" : "" },
            { label: QUESTION_STATUS_LABEL.not_applicable, value: counts.not_applicable, tone: "" },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className={`tabular font-heading text-xl leading-tight ${item.tone}`}>{formatNumber(item.value)}</dd>
            </div>
          ))}
        </dl>
        <CompletionBar
          segments={{
            total: counts.total,
            approved: counts.approved,
            notApplicable: counts.not_applicable,
            drafted: counts.drafted,
            needsEvidence: counts.needs_evidence,
          }}
        />
        <CompletionLegend />
      </section>

      {drafting ? (
        <div className="mb-5">
          <DraftRunner
            questionnaireId={questionnaire.id}
            total={counts.total}
            drafted={drafted}
            needsEvidence={counts.needs_evidence}
          />
        </div>
      ) : null}

      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <StatusFilter questionnaireId={questionnaire.id} counts={counts} current={filter} />
        {draftedConfidences.length > 0 ? <BulkApprove questionnaireId={questionnaire.id} confidences={draftedConfidences} /> : null}
      </div>

      <ReviewGrid
        rows={rows}
        sources={sources}
        drafting={drafting}
        emptyMessage={
          filter
            ? `No questions are ${QUESTION_STATUS_LABEL[filter].toLowerCase()}.`
            : "This questionnaire has no questions."
        }
      />
    </>
  );
}
