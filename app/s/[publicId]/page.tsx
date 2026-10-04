import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Clock, ShieldCheck } from "lucide-react";
import { formatDate, formatDateTime, formatNumber } from "@/components/dashboard/format";
import { CompletionBar } from "@/components/questionnaires/completion-bar";
import { ReviewGrid } from "@/components/questionnaires/review-grid";
import { QUESTION_STATUS_LABEL } from "@/components/questionnaires/status-chip";
import { pickSources, sharedToGridRow } from "@/components/questionnaires/types";
import { getSharedQuestionnaire } from "@/lib/services/questionnaires";

/**
 * Public read-only review (spec 3.5, Pro share links). The unguessable id is
 * the capability; no session is needed. Never indexed.
 */

const loadShared = cache(async (publicId: string) => getSharedQuestionnaire(publicId));

const NOINDEX: Metadata["robots"] = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

export async function generateMetadata({ params }: PageProps<"/s/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  const shared = await loadShared(publicId);
  return {
    title: shared ? `${shared.questionnaire.name} · ${shared.companyName}` : "Shared review",
    robots: NOINDEX,
    referrer: "no-referrer",
  };
}

function requestTime(): number {
  return Date.now();
}

export default async function SharedReviewPage({ params }: PageProps<"/s/[publicId]">) {
  const { publicId } = await params;
  const shared = await loadShared(publicId);
  const now = requestTime();
  if (!shared || shared.expiresAt.getTime() <= now) notFound();

  const { questionnaire, companyName } = shared;
  const rows = shared.questions.map(sharedToGridRow);
  const sources = pickSources(rows, shared.sourcesById);
  const count = (status: keyof typeof QUESTION_STATUS_LABEL) => rows.filter((r) => r.status === status).length;
  const approved = count("approved");
  const notApplicable = count("not_applicable");
  const needsEvidence = count("needs_evidence");
  const drafted = count("drafted");
  const daysLeft = Math.max(0, Math.ceil((shared.expiresAt.getTime() - now) / 86_400_000));

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="border-b bg-card/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="inline-flex items-center gap-2 font-heading font-bold tracking-tight">
            <span aria-hidden className="size-2.5 rounded-full bg-primary" />
            Attestly
          </p>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-evergreen" aria-hidden />
            Read-only review shared by {companyName}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-10">
        <div className="space-y-1.5 pb-5">
          <h1 className="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">{questionnaire.name}</h1>
          <p className="text-sm text-muted-foreground">
            Answered by <span className="text-foreground/85">{companyName}</span>
            {questionnaire.customer ? (
              <>
                {" "}
                for <span className="text-foreground/85">{questionnaire.customer}</span>
              </>
            ) : null}{" "}
            · last updated {formatDate(questionnaire.updatedAt, "UTC")}
          </p>
        </div>

        <p
          role="note"
          className="mb-5 flex items-start gap-2 rounded-lg border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-amber-foreground dark:text-amber"
        >
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This link expires on {formatDateTime(shared.expiresAt, "UTC")} UTC
            {daysLeft <= 1 ? " (within a day)" : ` (in ${daysLeft} days)`}. Answers marked drafted have not been approved yet.
          </span>
        </p>

        <section aria-label="Coverage" className="mb-5 grid gap-3 rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {[
              { label: "Questions", value: rows.length },
              { label: QUESTION_STATUS_LABEL.approved, value: approved },
              { label: QUESTION_STATUS_LABEL.drafted, value: drafted },
              { label: QUESTION_STATUS_LABEL.needs_evidence, value: needsEvidence },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="tabular font-heading text-xl leading-tight">{formatNumber(item.value)}</dd>
              </div>
            ))}
          </dl>
          <CompletionBar segments={{ total: rows.length, approved, notApplicable, drafted, needsEvidence }} />
        </section>

        <ReviewGrid rows={rows} sources={sources} readOnly emptyMessage="This questionnaire has no questions." />

        <p className="mt-6 text-xs text-muted-foreground">
          Every answer cites the passage of {companyName}&rsquo;s own documents it rests on; select a citation marker to
          read it. Answers without a citation say so.
        </p>
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          Shared with{" "}
          <Link href="/" className="font-medium text-evergreen underline-offset-3 hover:underline">
            Attestly
          </Link>
          , security questionnaires answered with citations.
        </div>
      </footer>
    </div>
  );
}
