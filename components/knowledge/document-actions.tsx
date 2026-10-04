"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDocumentAction, reindexDocumentAction } from "@/app/(app)/knowledge/actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * Re-index and Delete for one document. On the detail page (`onDetail`),
 * re-indexing moves to the new version's page and deleting goes back to the
 * list.
 */
export function DocumentActions({
  documentId,
  title,
  onDetail = false,
  canReindex = true,
}: {
  documentId: string;
  title: string;
  onDetail?: boolean;
  canReindex?: boolean;
}) {
  const router = useRouter();
  const [reindexing, startReindex] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function reindex() {
    startReindex(async () => {
      const result = await reindexDocumentAction(documentId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Re-indexed.");
      if (onDetail && result.data) router.replace(`/knowledge/${result.data.id}`);
    });
  }

  function remove() {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteDocumentAction(documentId);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setConfirmOpen(false);
      toast.success(`${title} deleted.`);
      if (onDetail) router.replace("/knowledge");
    });
  }

  return (
    <div className="flex items-center gap-1">
      {canReindex ? (
        <Button variant="ghost" size="sm" onClick={reindex} disabled={reindexing || deleting} aria-label={`Re-index ${title}`}>
          {reindexing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          <span className={onDetail ? undefined : "sr-only sm:not-sr-only"}>{reindexing ? "Re-indexing" : "Re-index"}</span>
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => {
          setDeleteError(null);
          setConfirmOpen(true);
        }}
        disabled={reindexing || deleting}
        aria-label={`Delete ${title}`}
      >
        <Trash2 aria-hidden />
        <span className={onDetail ? undefined : "sr-only sm:not-sr-only"}>Delete</span>
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${title}?`}
        description="The document and its chunks are removed from search. Answers that cited it keep their text, but the citation shows as “source removed”."
        confirmLabel="Delete document"
        pendingLabel="Deleting"
        pending={deleting}
        destructive
        error={deleteError}
        onConfirm={remove}
      />
    </div>
  );
}
