"use client";

import { useActionState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { loadDemoWorkspace } from "@/app/(app)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { initialFormState } from "./action-result";
import { FormMessage } from "./form-message";

/** Seeds the synthetic demo workspace, then the action redirects to its questionnaire. */
export function DemoWorkspaceButton({
  variant = "default",
  label = "Load demo workspace",
}: {
  variant?: "default" | "outline";
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(loadDemoWorkspace, initialFormState);
  return (
    <form action={formAction} className="grid justify-items-center gap-2">
      <Button type="submit" variant={variant} size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
        {pending ? "Building the demo workspace…" : label}
      </Button>
      {pending ? (
        <p role="status" className="max-w-xs text-center text-xs text-muted-foreground">
          Indexing six synthetic policies and a 40-question questionnaire. This takes up to a minute.
        </p>
      ) : null}
      <FormMessage error={state.error} upgradeUrl={state.upgradeUrl} className="max-w-sm" />
    </form>
  );
}
