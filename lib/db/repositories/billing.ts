import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { organizations } from "../schema";
import type { Organization } from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StripeOrgLookup = {
  /** Org id from Checkout's client_reference_id or the subscription's metadata.org_id. */
  orgId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
};

/**
 * Stripe webhook only (there is no session, so this is not org-scoped): finds
 * the organization a Stripe object belongs to, trying the explicit org id
 * first, then the subscription id, then the customer id.
 */
export async function findOrgForStripe(lookup: StripeOrgLookup): Promise<Organization | null> {
  const db = await getDb();
  const candidates = [
    lookup.orgId && UUID.test(lookup.orgId) ? eq(organizations.id, lookup.orgId) : null,
    lookup.subscriptionId ? eq(organizations.stripeSubscriptionId, lookup.subscriptionId) : null,
    lookup.customerId ? eq(organizations.stripeCustomerId, lookup.customerId) : null,
  ];
  for (const where of candidates) {
    if (!where) continue;
    const [row] = await db.select().from(organizations).where(where).limit(1);
    if (row) return row;
  }
  return null;
}
