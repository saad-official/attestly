import "server-only";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { getDb } from "../client";
import { shareLinks } from "../schema";
import type { ShareLink } from "../types";
import { assertQuestionnaireInOrg, isUniqueViolation, randomUrlSafeId } from "./shared";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SHARE_TTL_DAYS = 30;

/**
 * Read-only review link (Pro). The public id is 16 url-safe characters (96
 * bits): unguessable, so it is the capability; pages behind it are noindex.
 */
export async function create(
  orgId: string,
  questionnaireId: string,
  options: { ttlDays?: number; now?: Date } = {},
): Promise<ShareLink> {
  const db = await getDb();
  await assertQuestionnaireInOrg(db, orgId, questionnaireId);
  const ttlDays = Math.min(Math.max(options.ttlDays ?? DEFAULT_SHARE_TTL_DAYS, 1), 365);
  const expiresAt = new Date((options.now ?? new Date()).getTime() + ttlDays * DAY_MS);
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await db
        .insert(shareLinks)
        .values({ orgId, questionnaireId, publicId: randomUrlSafeId(16), expiresAt })
        .returning();
      return row;
    } catch (error) {
      if (attempt < 3 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}

/** The link when it exists and has not expired; null otherwise. Not org-scoped (public page). */
export async function getByPublicId(publicId: string, now: Date = new Date()): Promise<ShareLink | null> {
  if (!publicId || publicId.length > 64) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.publicId, publicId), gt(shareLinks.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

export async function listForQuestionnaire(orgId: string, questionnaireId: string): Promise<ShareLink[]> {
  const db = await getDb();
  return db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.questionnaireId, questionnaireId), eq(shareLinks.orgId, orgId)))
    .orderBy(desc(shareLinks.createdAt));
}

export async function revoke(orgId: string, shareLinkId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(shareLinks)
    .where(and(eq(shareLinks.id, shareLinkId), eq(shareLinks.orgId, orgId)))
    .returning({ id: shareLinks.id });
  return rows.length > 0;
}

/** Daily cron: deletes expired links across all orgs. Returns how many were removed. */
export async function purgeExpired(now: Date = new Date()): Promise<number> {
  const db = await getDb();
  const rows = await db.delete(shareLinks).where(lte(shareLinks.expiresAt, now)).returning({ id: shareLinks.id });
  return rows.length;
}
