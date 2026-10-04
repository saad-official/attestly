"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteQuestionnaireAction } from "@/app/(app)/questionnaires/actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";

/** Deletes the questionnaire (questions and share links too); the action redirects to the list. */
export function DeleteQuestionnaireButton({
  questionnaireId,
  name,
  label = "Delete",
  variant = "ghost",
}: {
  questionnaireId: string;
  name: string;
  label?: string;
  variant?: "ghost" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteQuestionnaireAction(questionnaireId);
      // On success the action redirects; a result means it failed.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <>
      <Button
        variant={variant}
        className="text-destructive hover:text-destructive"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden />
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${name}?`}
        description="The questionnaire, its questions, drafts and share links are deleted. Answers already approved stay in the answer library."
        confirmLabel="Delete questionnaire"
        pendingLabel="Deleting"
        pending={pending}
        destructive
        error={error}
        onConfirm={remove}
      />
    </>
  );
}
