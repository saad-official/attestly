import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { formatBytes, formatDateTime, formatNumber } from "@/components/dashboard/format";
import { DemoBadge, DOCUMENT_KIND_LABEL } from "@/components/knowledge/document-list";
import { DocumentActions } from "@/components/knowledge/document-actions";
import { DocumentStatusChip } from "@/components/questionnaires/status-chip";
import { requireOrgContext } from "@/lib/auth/session";
import * as chunksRepo from "@/lib/db/repositories/chunks";
import { listDocuments } from "@/lib/services/knowledge";

export const metadata: Metadata = { title: "Document" };

export const maxDuration = 120;

/** Chunks this short are shown in full instead of behind "Show full passage". */
const SHORT_CHUNK_CHARS = 280;

export default async function DocumentPage({ params }: PageProps<"/knowledge/[id]">) {
  const { org } = await requireOrgContext();
  const { id } = await params;
  // The knowledge service has no single-document getter; the list is
  // org-scoped and hides superseded versions, which is what this page wants.
  const doc = (await listDocuments(org.id)).find((d) => d.id === id);
  if (!doc) notFound();
  // No service lists a document's chunks; the repository read is org-scoped.
  const chunks = await chunksRepo.listForDocument(org.id, doc.id);

  return (
    <>
      <Link
        href="/knowledge"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-3 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Knowledge base
      </Link>
      <PageHeader
        title={doc.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <DocumentStatusChip status={doc.status} className="text-[0.7rem]" />
            {doc.isDemo ? <DemoBadge /> : null}
            <span className="font-mono text-xs">
              {DOCUMENT_KIND_LABEL[doc.kind]} · {formatNumber(doc.words)} words · {doc.pages === 1 ? "1 page" : `${doc.pages} pages`}
              {doc.fileName ? ` · ${doc.fileName}` : ""}
              {doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ""} · added {formatDateTime(doc.createdAt, org.timezone)}
            </span>
          </span>
        }
        actions={<DocumentActions documentId={doc.id} title={doc.title} onDetail canReindex={doc.status !== "indexing"} />}
      />

      {doc.error ? (
        <p
          role={doc.status === "failed" ? "alert" : "status"}
          className={
            doc.status === "failed"
              ? "mb-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              : "mb-6 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
          }
        >
          {doc.error}
        </p>
      ) : null}

      <section aria-labelledby="chunks-title" className="rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b px-4 py-3">
          <h2 id="chunks-title" className="text-base">
            Chunks
          </h2>
          <p className="text-xs text-muted-foreground">
            The passages drafts cite, in document order, each with the heading path it sits under.
          </p>
        </header>
        {chunks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {doc.status === "failed" ? "Nothing was indexed. Re-index once the file is fixed, or delete it." : "No chunks yet."}
          </p>
        ) : (
          <ol className="divide-y">
            {chunks.map((chunk) => (
              <li key={chunk.id} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-3">
                <span className="tabular font-mono text-xs text-muted-foreground">#{chunk.position + 1}</span>
                <div className="min-w-0">
                  <p className="font-mono text-[0.6875rem] leading-relaxed break-words text-muted-foreground">
                    {chunk.headingPath.length > 0 ? chunk.headingPath.join(" › ") : "No heading"}
                    <span className="ml-2">· {formatNumber(chunk.tokenCount)} tokens</span>
                  </p>
                  {chunk.text.length <= SHORT_CHUNK_CHARS ? (
                    <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/85">{chunk.text}</p>
                  ) : (
                    <details className="group mt-1">
                      <summary className="cursor-pointer list-none text-sm text-foreground/85 marker:hidden">
                        <span className="line-clamp-3 group-open:hidden">{chunk.text}</span>
                        <span className="mt-1 text-xs font-medium text-evergreen group-open:hidden">Show full passage</span>
                        <span className="hidden text-xs font-medium text-evergreen group-open:inline">Hide passage</span>
                      </summary>
                      <blockquote className="passage mt-2 text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-ink">
                        {chunk.text}
                      </blockquote>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
