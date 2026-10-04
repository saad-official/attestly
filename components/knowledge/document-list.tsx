import Link from "next/link";
import { formatBytes, formatDate, formatNumber } from "@/components/dashboard/format";
import { DocumentStatusChip } from "@/components/questionnaires/status-chip";
import { Badge } from "@/components/ui/badge";
import type { DocumentKind } from "@/lib/db/types";
import type { DocumentListItem } from "@/lib/services/knowledge";
import { DocumentActions } from "./document-actions";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  policy: "Policy",
  past_questionnaire: "Past questionnaire",
  pasted: "Pasted text",
};

export function DemoBadge() {
  return (
    <Badge variant="outline" className="font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase" title="Synthetic demo content">
      Demo
    </Badge>
  );
}

/** Current documents, newest first (superseded versions are hidden by the service). */
export function DocumentList({ documents, timeZone }: { documents: DocumentListItem[]; timeZone: string }) {
  return (
    <section aria-labelledby="documents-title" className="rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="documents-title" className="text-base">
          Documents
        </h2>
        <span className="tabular font-mono text-xs text-muted-foreground">{formatNumber(documents.length)}</span>
      </header>
      <ul className="divide-y">
        {documents.map((doc) => (
          <li key={doc.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/knowledge/${doc.id}`}
                  className="min-w-0 truncate font-medium underline-offset-3 hover:underline focus-visible:underline"
                >
                  {doc.title}
                </Link>
                <DocumentStatusChip status={doc.status} className="text-[0.7rem]" />
                {doc.isDemo ? <DemoBadge /> : null}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                <span>{DOCUMENT_KIND_LABEL[doc.kind]}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{doc.pages === 1 ? "1 page" : `${formatNumber(doc.pages)} pages`}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{doc.chunkCount === 1 ? "1 chunk" : `${formatNumber(doc.chunkCount)} chunks`}</span>
                {doc.fileName ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="max-w-[16rem] truncate">{doc.fileName}</span>
                  </>
                ) : null}
                {doc.sizeBytes ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{formatBytes(doc.sizeBytes)}</span>
                  </>
                ) : null}
                <span aria-hidden>·</span>
                <span>{formatDate(doc.createdAt, timeZone)}</span>
              </p>
              {doc.status === "failed" && doc.error ? (
                <p className="mt-1.5 text-sm text-destructive">{doc.error}</p>
              ) : doc.error ? (
                <p className="mt-1.5 text-xs text-muted-foreground">{doc.error}</p>
              ) : null}
              {doc.excerpt ? <p className="mt-1.5 line-clamp-2 text-sm text-foreground/75">{doc.excerpt}</p> : null}
            </div>
            <DocumentActions documentId={doc.id} title={doc.title} canReindex={doc.status !== "indexing"} />
          </li>
        ))}
      </ul>
    </section>
  );
}
