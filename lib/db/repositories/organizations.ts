import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { organizations } from "../schema";
import type { Organization, Plan } from "../types";

export async function getById(orgId: string): Promise<Organization | null> {
  const db = await getDb();
  const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return row ?? null;
}

export type OrganizationSettings = {
  name?: string;
  /** IANA time zone, e.g. "Europe/Berlin". */
  timezone?: string;
};

export async function updateSettings(orgId: string, patch: OrganizationSettings): Promise<Organization | null> {
  const values: OrganizationSettings = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Organization name cannot be empty.");
    values.name = name;
  }
  if (patch.timezone !== undefined) {
    if (!isValidTimeZone(patch.timezone)) throw new Error(`Unknown time zone: ${patch.timezone}`);
    values.timezone = patch.timezone;
  }
  if (Object.keys(values).length === 0) return getById(orgId);
  const db = await getDb();
  const [row] = await db.update(organizations).set(values).where(eq(organizations.id, orgId)).returning();
  return row ?? null;
}

export type PlanChange = {
  plan: Plan;
  /** Pass null to clear; omit to leave unchanged. */
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

export async function setPlan(orgId: string, change: PlanChange): Promise<Organization | null> {
  const values: Partial<Organization> = { plan: change.plan };
  if (change.stripeCustomerId !== undefined) values.stripeCustomerId = change.stripeCustomerId;
  if (change.stripeSubscriptionId !== undefined) values.stripeSubscriptionId = change.stripeSubscriptionId;
  const db = await getDb();
  const [row] = await db.update(organizations).set(values).where(eq(organizations.id, orgId)).returning();
  return row ?? null;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
