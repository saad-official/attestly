"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { addLibraryAnswerAction } from "@/app/(app)/library/actions";
import { initialFormState, type FormActionState } from "@/components/dashboard/action-result";
import { FormMessage } from "@/components/dashboard/form-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function AddAnswerForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(addLibraryAnswerAction, initialFormState);
  const handled = useRef<FormActionState | null>(null);

  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      toast.success(state.message ?? "Answer added.");
      onDone();
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="library-question">Question</Label>
        <Textarea
          id="library-question"
          name="question"
          required
          rows={2}
          maxLength={8000}
          placeholder="Do you encrypt customer data at rest?"
          disabled={pending}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="library-answer">Approved answer</Label>
        <Textarea
          id="library-answer"
          name="answer"
          required
          rows={6}
          maxLength={8000}
          placeholder="Yes. Customer data in databases and backups is encrypted at rest with AES-256…"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Drafts can cite library answers like policy passages, so write only what you would send to a customer.
        </p>
      </div>
      <FormMessage error={state.error} upgradeUrl={state.upgradeUrl} />
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          {pending ? "Adding" : "Add to library"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddAnswerDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Add answer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">Add a library answer</DialogTitle>
          <DialogDescription>A question and the answer you have approved for it before.</DialogDescription>
        </DialogHeader>
        <AddAnswerForm key={formKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
