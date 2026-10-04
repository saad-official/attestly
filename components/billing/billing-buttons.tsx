"use client";

import { useActionState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { openPortal, startCheckout } from "@/app/(app)/billing/actions";
import { Button } from "@/components/ui/button";
import { initialBillingState } from "./form-state";

function ActionButton({
  action,
  field,
  label,
  pendingLabel,
  disabled,
  variant,
}: {
  action: typeof startCheckout;
  field: { name: string; value: string };
  label: string;
  pendingLabel: string;
  disabled: boolean;
  variant: "default" | "outline";
}) {
  const [state, formAction, pending] = useActionState(action, initialBillingState);
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name={field.name} value={field.value} />
      <Button type="submit" size="lg" variant={variant} disabled={disabled || pending} className="h-10">
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {pendingLabel}
          </>
        ) : (
          <>
            {label}
            <ArrowUpRight aria-hidden />
          </>
        )}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function UpgradeButton({ disabled }: { disabled: boolean }) {
  return (
    <ActionButton
      action={startCheckout}
      field={{ name: "plan", value: "pro" }}
      label="Upgrade to Pro"
      pendingLabel="Opening Stripe Checkout"
      disabled={disabled}
      variant="default"
    />
  );
}

export function ManageButton({ disabled }: { disabled: boolean }) {
  return (
    <ActionButton
      action={openPortal}
      field={{ name: "intent", value: "manage" }}
      label="Manage subscription"
      pendingLabel="Opening Stripe"
      disabled={disabled}
      variant="outline"
    />
  );
}
