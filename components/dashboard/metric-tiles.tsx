import { MetricTile } from "@/components/app/metric-tile";
import type { DashboardMetrics } from "@/lib/services/metrics";
import { formatNumber, pluralize } from "./format";

/** The six dashboard numbers (spec 3.6). */
export function MetricTiles({ metrics }: { metrics: DashboardMetrics }) {
  const needsEvidence = metrics.inProgress.reduce((sum, q) => sum + q.needsEvidenceCount, 0);
  const awaitingReview = metrics.inProgress.reduce((sum, q) => sum + q.awaitingReviewCount, 0);
  const { documents, chunks, indexing } = metrics.knowledge;

  return (
    <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <MetricTile
        label="In progress"
        value={formatNumber(metrics.inProgress.length)}
        caption={`${pluralize(metrics.questionnaireCount, "questionnaire")} in total`}
      />
      <MetricTile
        label="Approved answers"
        value={formatNumber(metrics.approvedAnswers)}
        tone={metrics.approvedAnswers > 0 ? "positive" : "default"}
        caption={awaitingReview > 0 ? `${formatNumber(awaitingReview)} drafted, waiting for review` : "Across every questionnaire"}
      />
      <MetricTile
        label="Hours saved"
        value={metrics.hoursSaved.toFixed(1)}
        caption="About 4 minutes per approved answer"
      />
      <MetricTile
        label="Knowledge base"
        value={formatNumber(documents)}
        caption={`${documents === 1 ? "document" : "documents"} · ${pluralize(chunks, "chunk")}${
          indexing > 0 ? ` · ${formatNumber(indexing)} indexing` : ""
        }`}
      />
      <MetricTile
        label="Library answers"
        value={formatNumber(metrics.libraryCount)}
        caption="Past answers reused when drafting"
      />
      <MetricTile
        label="Needs evidence"
        value={formatNumber(needsEvidence)}
        tone={needsEvidence > 0 ? "attention" : "default"}
        caption={needsEvidence > 0 ? "Questions no policy answers yet" : "Every open question has evidence"}
      />
    </section>
  );
}
