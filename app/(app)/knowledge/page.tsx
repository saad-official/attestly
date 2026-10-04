import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DemoWorkspaceButton } from "@/components/dashboard/demo-workspace-button";
import { DocumentList } from "@/components/knowledge/document-list";
import { PasteDialog } from "@/components/knowledge/paste-dialog";
import { QuotaBar } from "@/components/knowledge/quota-bar";
import { UploadCard } from "@/components/knowledge/upload-card";
import { requireOrgContext } from "@/lib/auth/session";
import { knowledgeStats, listDocuments } from "@/lib/services/knowledge";

export const metadata: Metadata = { title: "Knowledge base" };

/** Re-index and paste (Server Actions on this page) chunk and embed a whole document. */
export const maxDuration = 120;

export default async function KnowledgePage() {
  const { org } = await requireOrgContext();
  const [documents, stats] = await Promise.all([listDocuments(org.id), knowledgeStats(org.id)]);

  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="The policies every draft is written from. Each document is split into passages that keep their heading path, so a citation points at the exact section."
        actions={<PasteDialog />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <QuotaBar stats={stats} />
          {documents.length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Upload your information security policy, access control, incident response and the like. Or load the synthetic demo workspace to see how drafting works."
              action={<DemoWorkspaceButton variant="outline" />}
            />
          ) : (
            <DocumentList documents={documents} timeZone={org.timezone} />
          )}
        </div>
        <div className="order-1 lg:sticky lg:top-6 lg:order-2">
          <UploadCard />
        </div>
      </div>
    </>
  );
}
