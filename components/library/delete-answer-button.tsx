"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteLibraryAnswerAction } from "@/app/(app)/library/actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";

export function DeleteAnswerButton({ id, question }: { id: string; question: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteLibraryAnswerAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(result.message ?? "Answer removed.");
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label="Delete this library answer"
      >
        <Trash2 aria-hidden />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove this answer?"
        description={
          <>
            “{question.length > 140 ? `${question.slice(0, 140)}…` : question}” will no longer be used when drafting.
            Answers already approved in questionnaires keep their text.
          </>
        }
        confirmLabel="Remove answer"
        pendingLabel="Removing"
        pending={pending}
        destructive
        error={error}
        onConfirm={remove}
      />
    </>
  );
}
