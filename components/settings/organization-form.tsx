"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateOrganizationAction } from "@/app/(app)/settings/actions";
import { initialFormState, type FormActionState } from "@/components/dashboard/action-result";
import { FormMessage } from "@/components/dashboard/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrganizationForm({
  name,
  timezone,
  timeZones,
  canEdit,
}: {
  name: string;
  timezone: string;
  timeZones: string[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateOrganizationAction, initialFormState);
  const handled = useRef<FormActionState | null>(null);

  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      toast.success(state.message ?? "Saved.");
    }
  }, [state]);

  const zones = timeZones.includes(timezone) ? timeZones : [timezone, ...timeZones];

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="org-name">Company name</Label>
        <Input id="org-name" name="name" defaultValue={name} required maxLength={120} disabled={!canEdit || pending} />
        <p className="text-xs text-muted-foreground">
          Drafts are written on behalf of this name (&ldquo;{name} encrypts&hellip;&rdquo;), so use the name customers know.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="org-timezone">Time zone</Label>
        <select
          id="org-timezone"
          name="timezone"
          defaultValue={timezone}
          disabled={!canEdit || pending}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Dates across the app are shown in this time zone.</p>
      </div>
      <FormMessage error={state.error} upgradeUrl={state.upgradeUrl} />
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {pending ? "Saving" : "Save settings"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Only the organisation owner can change these settings.</p>
      )}
    </form>
  );
}
