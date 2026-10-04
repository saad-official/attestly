"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pasteDocumentAction } from "@/app/(app)/knowledge/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Server Action bodies are capped at 1 MB; larger text goes through the file upload. */
const MAX_PASTE_CHARS = 900_000;

function PasteForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(pasteDocumentAction, initialFormState);
  const [length, setLength] = useState(0);
  const handled = useRef<FormActionState | null>(null);

  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      toast.success(state.message ?? "Text indexed.");
      onDone();
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="paste-title">Title</Label>
        <Input id="paste-title" name="title" required maxLength={200} placeholder="e.g. Encryption standard" disabled={pending} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="paste-text">Text</Label>
        <Textarea
          id="paste-text"
          name="text"
          required
          rows={12}
          maxLength={MAX_PASTE_CHARS}
          onChange={(e) => setLength(e.target.value.length)}
          placeholder={"# Encryption\n\n## Data at rest\nCustomer data is encrypted with AES-256…"}
          className="max-h-[50svh] font-mono text-xs"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Markdown headings (#, ##) become the heading path shown with each citation.{" "}
          <span className="tabular font-mono">{length.toLocaleString("en-US")}</span> characters.
        </p>
      </div>
      <FormMessage error={state.error} upgradeUrl={state.upgradeUrl} />
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardPaste aria-hidden />}
          {pending ? "Indexing" : "Index text"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PasteDialog() {
  const [open, setOpen] = useState(false);
  // A fresh form (and action state) each time the dialog opens.
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
        <Button variant="outline">
          <ClipboardPaste aria-hidden />
          Paste text
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">Paste a policy</DialogTitle>
          <DialogDescription>
            For policies that live in a wiki or a doc. The text is chunked by heading, embedded and searched like an
            uploaded file.
          </DialogDescription>
        </DialogHeader>
        <PasteForm key={formKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
