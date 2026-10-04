"use client";

import { useState, useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { clearDemoAction } from "@/app/(app)/settings/actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";

/** Remove the synthetic demo workspace; deleting the organisation is a placeholder for now. */
export function DangerZone({ canEdit, ownerEmail }: { canEdit: boolean; ownerEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function clear() {
    setError(null);
    startTransition(async () => {
      const result = await clearDemoAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(result.message ?? "Demo workspace removed.");
    });
  }

  return (
    <div className="divide-y rounded-xl border border-destructive/30 bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Remove the demo workspace</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Deletes the synthetic demo policies, the demo library answers and the Acme Corp questionnaire. Your own
            documents and answers are untouched.
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          disabled={!canEdit}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <FlaskConical aria-hidden />
          Remove demo
        </Button>
      </div>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Delete the organisation</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Self-service deletion is not available yet. To delete the organisation with every document, questionnaire and
            answer, contact support from {ownerEmail ?? "the owner's email address"}.
          </p>
        </div>
        <Button variant="destructive" className="shrink-0" disabled>
          Delete organisation
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove the demo workspace?"
        description="The six demo policies, the imported demo answers, the Acme Corp questionnaire and answers approved from it are deleted."
        confirmLabel="Remove demo"
        pendingLabel="Removing"
        pending={pending}
        destructive
        error={error}
        onConfirm={clear}
      />
    </div>
  );
}
