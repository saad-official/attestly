import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, Plus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DemoWorkspaceButton } from "@/components/dashboard/demo-workspace-button";
import { InProgressList } from "@/components/dashboard/in-progress-list";
import { KnowledgeGaps } from "@/components/dashboard/knowledge-gaps";
import { MetricTiles } from "@/components/dashboard/metric-tiles";
import { Button } from "@/components/ui/button";
import { requireOrgContext } from "@/lib/auth/session";
import { dashboardMetrics } from "@/lib/services/metrics";

export const metadata: Metadata = { title: "Dashboard" };

/** Seeding the demo workspace (a Server Action on this page) embeds six documents. */
export const maxDuration = 120;

export default async function DashboardPage() {
  const { org } = await requireOrgContext();
  const metrics = await dashboardMetrics(org.id);
  const isEmpty = metrics.questionnaireCount === 0 && metrics.knowledge.documents === 0 && metrics.libraryCount === 0;

  if (isEmpty) {
    return (
      <>
        <PageHeader title="Dashboard" description={`Welcome to Attestly, ${org.name}.`} />
        <EmptyState
          className="ledger-lines"
          title="Start with your policies, or with the demo"
          description={
            <>
              Attestly drafts every answer from your own documents, with a citation to the exact passage. Load a
              synthetic demo workspace (six policies and a 40-question questionnaire) to see it end to end, or upload a
              policy of your own.
            </>
          }
          action={
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <DemoWorkspaceButton />
              <Button asChild variant="outline" size="lg">
                <Link href="/knowledge">
                  <FileUp aria-hidden />
                  Upload a policy
                </Link>
              </Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Coverage across open questionnaires, what your knowledge base holds, and which policies to write next."
        actions={
          <Button asChild>
            <Link href="/questionnaires#new">
              <Plus aria-hidden />
              New questionnaire
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <MetricTiles metrics={metrics} />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <InProgressList items={metrics.inProgress} timeZone={org.timezone} />
          <KnowledgeGaps gaps={metrics.gaps} error={metrics.gapsError} />
        </div>
        {metrics.questionnaireCount === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              No questionnaires yet. Try the synthetic demo questionnaire to see drafting with citations.
            </p>
            <DemoWorkspaceButton variant="outline" />
          </div>
        ) : null}
      </div>
    </>
  );
}
