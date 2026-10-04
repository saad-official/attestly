import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { outbox } from "../schema";
import type { OutboxMessage } from "../types";
import { clampLimit } from "./shared";

export type InsertOutboxInput = {
  toEmail: string;
  subject: string;
  text: string;
  html?: string | null;
  /** Short message kind, e.g. "welcome", "drafting_done". */
  kind?: string | null;
  provider?: OutboxMessage["provider"];
  providerMessageId?: string | null;
  deliveredTo?: string | null;
  status?: OutboxMessage["status"];
};

export async function insert(orgId: string, input: InsertOutboxInput): Promise<OutboxMessage> {
  const db = await getDb();
  const [row] = await db
    .insert(outbox)
    .values({
      orgId,
      kind: input.kind ?? null,
      toEmail: input.toEmail,
      subject: input.subject,
      text: input.text,
      html: input.html ?? null,
      provider: input.provider ?? "outbox",
      providerMessageId: input.providerMessageId ?? null,
      deliveredTo: input.deliveredTo ?? null,
      status: input.status ?? "queued",
    })
    .returning();
  return row;
}

export async function listForOrg(orgId: string, options: { limit?: number } = {}): Promise<OutboxMessage[]> {
  const db = await getDb();
  return db
    .select()
    .from(outbox)
    .where(eq(outbox.orgId, orgId))
    .orderBy(desc(outbox.createdAt))
    .limit(clampLimit(options.limit));
}
