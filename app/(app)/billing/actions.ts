"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { BillingActionState } from "@/components/billing/form-state";
import { requireOrgContext } from "@/lib/auth/session";
import { optionalEnv } from "@/lib/env";
import {
  createCheckoutSession,
  createPortalSession,
  isBillingConfigured,
  isPortalConfigured,
} from "@/lib/stripe/billing";

/*
 * Billing actions only create Stripe-hosted sessions and redirect to them.
 * The plan itself changes when Stripe calls /api/webhooks/stripe, which
 * writes organizations.plan through organizations.setPlan.
 */

const checkoutSchema = z.object({ plan: z.literal("pro", { error: "Unknown plan." }) });
const portalSchema = z.object({ intent: z.literal("manage", { error: "Unknown request." }) });

/** Base URL for Stripe's return links: NEXT_PUBLIC_APP_URL when set, else the request's own origin. */
async function appUrl(): Promise<string> {
  const configured = optionalEnv("NEXT_PUBLIC_APP_URL");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function describe(error: unknown): string {
  console.error("[stripe] session creation failed", error instanceof Error ? error.message : error);
  return "Stripe could not start that session. Check the Stripe keys and the USD price id, then try again.";
}

export async function startCheckout(_prev: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const { user, org, role } = await requireOrgContext();
  if (!checkoutSchema.safeParse({ plan: formData.get("plan") }).success) return { error: "Unknown plan." };
  if (role !== "owner") return { error: "Only the organisation owner can change the plan." };
  if (!isBillingConfigured()) return { error: "Billing is not configured on this deployment." };
  if (org.plan === "pro") return { error: "You're already on Pro. Use Manage subscription instead." };

  let url: string;
  try {
    url = await createCheckoutSession({ org, userEmail: user.email, appUrl: await appUrl() });
  } catch (error) {
    return { error: describe(error) };
  }
  revalidatePath("/billing");
  redirect(url);
}

export async function openPortal(_prev: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const { org, role } = await requireOrgContext();
  if (!portalSchema.safeParse({ intent: formData.get("intent") }).success) return { error: "Unknown request." };
  if (role !== "owner") return { error: "Only the organisation owner can manage the subscription." };
  if (!isPortalConfigured()) return { error: "Billing is not configured on this deployment." };
  if (!org.stripeCustomerId) return { error: "There is no Stripe customer for this organisation yet." };

  let url: string;
  try {
    url = await createPortalSession({ customerId: org.stripeCustomerId, appUrl: await appUrl() });
  } catch (error) {
    return { error: describe(error) };
  }
  revalidatePath("/billing");
  redirect(url);
}
