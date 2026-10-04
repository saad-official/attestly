import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { logAgentEvent } from "@/lib/ai/log";
import { MIGRATIONS_CONFIG, migrationsFolder, type DbHandle } from "@/lib/db/client";
import * as chunksRepo from "@/lib/db/repositories/chunks";
import * as documentsRepo from "@/lib/db/repositories/documents";
import * as libraryRepo from "@/lib/db/repositories/libraryAnswers";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import * as outboxRepo from "@/lib/db/repositories/outbox";
import * as questionnairesRepo from "@/lib/db/repositories/questionnaires";
import * as questionsRepo from "@/lib/db/repositories/questions";
import * as shareLinksRepo from "@/lib/db/repositories/shareLinks";
import { NotFoundError } from "@/lib/db/repositories/shared";
import { agentEvents, chunks, organizations } from "@/lib/db/schema";
import { dbErrorMessage, fakeEmbedding, insertOrg, queryRows, startTestDb, stopTestDb } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb(handle);
});

const DAY = 24 * 60 * 60 * 1000;

async function readyDocument(orgId: string, title: string) {
  const doc = await documentsRepo.create(orgId, { title, kind: "policy", text: `${title} text` });
  return doc;
}

describe("migrations", () => {
  it("creates every table in the attestly schema and nothing in public", async () => {
    const rows = await queryRows<{ table_schema: string; table_name: string }>(
      handle,
      sql`select table_schema, table_name from information_schema.tables
          where table_schema in ('attestly', 'public', 'drizzle') order by table_name`,
    );
    expect(rows.every((r) => r.table_schema === "attestly")).toBe(true);
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        "__drizzle_migrations",
        "account",
        "agent_events",
        "chunks",
        "documents",
        "library_answers",
        "memberships",
        "organizations",
        "outbox",
        "questionnaires",
        "questions",
        "session",
        "share_links",
        "user",
        "verification",
      ]),
    );
  });

  it("enables pgvector and builds the HNSW and GIN indexes", async () => {
    const ext = await queryRows<{ extname: string }>(handle, sql`select extname from pg_extension where extname = 'vector'`);
    expect(ext).toHaveLength(1);
    const indexes = await queryRows<{ indexname: string; indexdef: string }>(
      handle,
      sql`select indexname, indexdef from pg_indexes where schemaname = 'attestly'
          and indexname in ('chunks_embedding_hnsw_idx', 'library_answers_embedding_hnsw_idx', 'chunks_tsv_gin_idx')
          order by indexname`,
    );
    expect(indexes.map((i) => i.indexname)).toEqual([
      "chunks_embedding_hnsw_idx",
      "chunks_tsv_gin_idx",
      "library_answers_embedding_hnsw_idx",
    ]);
    expect(indexes[0].indexdef).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
    expect(indexes[1].indexdef).toMatch(/USING gin \(tsv\)/);
  });

  it("is idempotent", async () => {
    await expect(
      migrate(handle.db as never, { migrationsFolder: migrationsFolder(), ...MIGRATIONS_CONFIG }),
    ).resolves.toBeUndefined();
  });
});

describe("organizations", () => {
  it("updates settings and plan", async () => {
    const org = await insertOrg(handle);
    const updated = await organizationsRepo.updateSettings(org.id, { name: "  Renamed Co ", timezone: "Europe/Berlin" });
    expect(updated).toMatchObject({ name: "Renamed Co", timezone: "Europe/Berlin" });
    await expect(organizationsRepo.updateSettings(org.id, { timezone: "Mars/Olympus" })).rejects.toThrow(/time zone/);
    const pro = await organizationsRepo.setPlan(org.id, { plan: "pro", stripeCustomerId: "cus_123" });
    expect(pro).toMatchObject({ plan: "pro", stripeCustomerId: "cus_123", stripeSubscriptionId: null });
    expect((await organizationsRepo.getById(org.id))?.plan).toBe("pro");
  });
});

describe("documents and chunks", () => {
  it("stores the original bytes as bytea and keeps them out of list queries", async () => {
    const org = await insertOrg(handle);
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    const doc = await documentsRepo.create(org.id, {
      title: "Information Security Policy",
      fileName: "isp.pdf",
      mimeType: "application/pdf",
      original: bytes,
    });
    expect(doc).toMatchObject({ status: "indexing", sizeBytes: 6, chunkCount: 0 });
    expect("original" in doc).toBe(false);

    const original = await documentsRepo.getOriginal(org.id, doc.id);
    expect(Buffer.isBuffer(original?.original)).toBe(true);
    expect(original?.original.equals(bytes)).toBe(true);

    const updated = await documentsRepo.update(org.id, doc.id, { text: "Body", status: "failed", error: "boom" });
    expect(updated).toMatchObject({ text: "Body", status: "failed", error: "boom" });
    const ready = await documentsRepo.markReady(org.id, doc.id, 3);
    expect(ready).toMatchObject({ status: "ready", chunkCount: 3, error: null });

    const listed = await documentsRepo.listForOrg(org.id);
    expect(listed.map((d) => d.id)).toEqual([doc.id]);
    expect("original" in listed[0]).toBe(false);
  });

  it("ranks the nearest chunk first by cosine distance", async () => {
    const org = await insertOrg(handle);
    const doc = await readyDocument(org.id, "Access Control Policy");
    await chunksRepo.bulkInsert(org.id, doc.id, [
      { position: 0, headingPath: ["Access Control", "Passwords"], text: "Passwords are at least 14 characters.", tokenCount: 8, embedding: fakeEmbedding(1) },
      { position: 1, headingPath: ["Access Control", "MFA"], text: "MFA is required for all staff.", tokenCount: 7, embedding: fakeEmbedding(2) },
      { position: 2, headingPath: ["Access Control", "Reviews"], text: "Access is reviewed quarterly.", tokenCount: 5, embedding: fakeEmbedding(3) },
      { position: 3, headingPath: [], text: "Not embedded yet.", tokenCount: 3 },
    ]);
    await documentsRepo.markReady(org.id, doc.id, 4);

    // Query close to axis 2, a little towards axis 3.
    const query = fakeEmbedding(2, { axis: 3, weight: 0.3 });
    const hits = await chunksRepo.searchByEmbedding(org.id, query, 3);
    expect(hits.map((h) => h.text)).toEqual([
      "MFA is required for all staff.",
      "Access is reviewed quarterly.",
      "Passwords are at least 14 characters.",
    ]);
    expect(hits[0]).toMatchObject({ documentId: doc.id, documentTitle: "Access Control Policy", headingPath: ["Access Control", "MFA"] });
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits[1].score).toBeGreaterThan(hits[2].score);
    expect(hits[0].score).toBeLessThanOrEqual(1);
    expect("embedding" in hits[0]).toBe(false);

    await expect(chunksRepo.searchByEmbedding(org.id, [1, 2, 3])).rejects.toThrow(/768/);

    const missing = await chunksRepo.listMissingEmbeddings(org.id);
    expect(missing.map((m) => m.text)).toEqual(["Not embedded yet."]);
    expect(await chunksRepo.setEmbedding(org.id, missing[0].id, fakeEmbedding(9))).toBe(true);
    expect(await chunksRepo.listMissingEmbeddings(org.id)).toEqual([]);
  });

  it("finds chunks by keyword with websearch_to_tsquery and ranks heading matches", async () => {
    const org = await insertOrg(handle);
    const doc = await readyDocument(org.id, "Incident Response Plan");
    await chunksRepo.bulkInsert(org.id, doc.id, [
      { position: 0, headingPath: ["Incident Response"], text: "Security incidents are triaged within one hour.", embedding: fakeEmbedding(4) },
      { position: 1, headingPath: ["Backups"], text: "Backups are encrypted with AES-256 and tested monthly.", embedding: fakeEmbedding(5) },
      { position: 2, headingPath: ["Logging"], text: "Logs are retained for twelve months.", embedding: fakeEmbedding(6) },
    ]);
    await documentsRepo.markReady(org.id, doc.id, 3);

    // Stemming: "encryption" matches "encrypted".
    const encrypted = await chunksRepo.searchByKeywords(org.id, "Do you use encryption for backups?");
    expect(encrypted[0].text).toMatch(/AES-256/);
    expect(encrypted[0].score).toBeGreaterThan(0);

    // "any" (default) still matches when only some words appear; "all" requires every term.
    expect((await chunksRepo.searchByKeywords(org.id, "incident escalation matrix")).map((h) => h.position)).toEqual([0]);
    expect(await chunksRepo.searchByKeywords(org.id, "incident escalation matrix", 8, { match: "all" })).toEqual([]);
    expect((await chunksRepo.searchByKeywords(org.id, '"retained for twelve months"', 8, { match: "all" }))[0].position).toBe(2);

    expect(await chunksRepo.searchByKeywords(org.id, "   ")).toEqual([]);
    expect(await chunksRepo.searchByKeywords(org.id, "the and of")).toEqual([]);
  });

  it("isolates organizations and hides indexing or superseded documents", async () => {
    const orgA = await insertOrg(handle, "A");
    const orgB = await insertOrg(handle, "B");
    const docA = await readyDocument(orgA.id, "A policy");
    const docB = await readyDocument(orgB.id, "B policy");
    await chunksRepo.bulkInsert(orgA.id, docA.id, [{ position: 0, text: "Firewall rules for tenant A", embedding: fakeEmbedding(10) }]);
    await chunksRepo.bulkInsert(orgB.id, docB.id, [{ position: 0, text: "Firewall rules for tenant B", embedding: fakeEmbedding(10) }]);

    // Still indexing: invisible to search.
    expect(await chunksRepo.searchByKeywords(orgA.id, "firewall")).toEqual([]);
    await documentsRepo.markReady(orgA.id, docA.id, 1);
    await documentsRepo.markReady(orgB.id, docB.id, 1);

    const a = await chunksRepo.searchByEmbedding(orgA.id, fakeEmbedding(10), 10);
    expect(a.map((h) => h.text)).toEqual(["Firewall rules for tenant A"]);
    const b = await chunksRepo.searchByKeywords(orgB.id, "firewall");
    expect(b.map((h) => h.text)).toEqual(["Firewall rules for tenant B"]);

    // Cross-org writes and reads are refused.
    await expect(chunksRepo.bulkInsert(orgB.id, docA.id, [{ position: 1, text: "x" }])).rejects.toBeInstanceOf(NotFoundError);
    expect(await documentsRepo.getById(orgB.id, docA.id)).toBeNull();
    expect(await documentsRepo.update(orgB.id, docA.id, { status: "failed" })).toBeNull();
    expect(await documentsRepo.remove(orgB.id, docA.id)).toBe(false);
    expect(await chunksRepo.getByIds(orgB.id, a.map((h) => h.id))).toEqual([]);

    // Superseded versions drop out of search but still resolve as citations.
    expect(await documentsRepo.markSuperseded(orgA.id, docA.id)).toBe(true);
    expect(await chunksRepo.searchByEmbedding(orgA.id, fakeEmbedding(10))).toEqual([]);
    expect(await chunksRepo.getByIds(orgA.id, [a[0].id])).toHaveLength(1);

    // Deleting a document cascades to its chunks.
    expect(await chunksRepo.deleteForDocument(orgB.id, docB.id)).toBe(1);
    expect(await documentsRepo.remove(orgA.id, docA.id)).toBe(true);
    const left = await handle.db.select().from(chunks).where(eq(chunks.documentId, docA.id));
    expect(left).toEqual([]);
  });

  it("reports knowledge-base stats", async () => {
    const org = await insertOrg(handle);
    const doc = await readyDocument(org.id, "Stats");
    await chunksRepo.bulkInsert(org.id, doc.id, [
      { position: 0, text: "one" },
      { position: 1, text: "two" },
    ]);
    await documentsRepo.create(org.id, { title: "Pending" });
    expect(await documentsRepo.statsForOrg(org.id)).toEqual({ documents: 2, chunks: 2, pending: 2 });
  });
});

async function seedQuestionnaire(orgId: string, rows = 4) {
  const questionnaire = await questionnairesRepo.create(orgId, {
    name: "Acme Corp vendor security questionnaire",
    customer: "Acme Corp",
    fileName: "acme.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    original: Buffer.from("PK\u0003\u0004fake-xlsx"),
  });
  await questionnairesRepo.updateMapping(orgId, questionnaire.id, {
    sheetName: "Questions",
    headerRow: 1,
    idCol: 1,
    questionCol: 2,
    answerCol: 3,
    commentCol: null,
  });
  const inserted = await questionsRepo.bulkInsert(
    orgId,
    questionnaire.id,
    Array.from({ length: rows }, (_, i) => ({
      rowNumber: i + 2,
      externalId: `Q-${i + 1}`,
      section: i < 2 ? "ACCESS CONTROL" : "ENCRYPTION",
      text: `Question ${i + 1}?`,
    })),
  );
  expect(inserted).toBe(rows);
  return questionnaire;
}

describe("questionnaires and questions", () => {
  it("stores the workbook, mapping and counters", async () => {
    const org = await insertOrg(handle);
    const q = await seedQuestionnaire(org.id, 5);
    const fresh = await questionnairesRepo.getById(org.id, q.id);
    expect(fresh).toMatchObject({
      status: "mapping",
      sheetName: "Questions",
      headerRow: 1,
      questionCol: 2,
      answerCol: 3,
      commentCol: null,
      questionCount: 5,
      draftedCount: 0,
    });
    expect("original" in fresh!).toBe(false);
    expect((await questionnairesRepo.getOriginal(org.id, q.id))?.original.toString()).toBe("PK\u0003\u0004fake-xlsx");
    await expect(
      questionnairesRepo.updateMapping(org.id, q.id, { sheetName: null, headerRow: 0, questionCol: 1, answerCol: 2 }),
    ).rejects.toThrow(/headerRow/);
    expect(await questionnairesRepo.countCreatedSince(org.id, new Date(Date.now() - DAY))).toBe(1);
  });

  it("drafts in batches, reviews, and keeps the counters exact", async () => {
    const org = await insertOrg(handle);
    const reviewer = "user-reviewer";
    await handle.db.execute(sql`insert into attestly."user" (id, name, email) values (${reviewer}, 'R', 'r@example.com')`);
    const q = await seedQuestionnaire(org.id, 4);
    await questionnairesRepo.updateStatus(org.id, q.id, "drafting");

    const batch = await questionsRepo.nextPending(org.id, q.id, 3);
    expect(batch.map((x) => x.rowNumber)).toEqual([2, 3, 4]);

    await questionsRepo.updateDraft(org.id, batch[0].id, {
      draft: "Yes. MFA is enforced.",
      status: "drafted",
      confidence: 0.92,
      citations: [{ chunkId: "00000000-0000-0000-0000-000000000001", quote: "MFA is required" }],
      retrieval: { chunks: [] },
    });
    await questionsRepo.updateDraft(org.id, batch[1].id, { draft: "Partially.", status: "drafted", confidence: 0.4 });
    await questionsRepo.updateDraft(org.id, batch[2].id, {
      draft: "",
      status: "needs_evidence",
      confidence: 7, // clamped to 1
      notes: "Needs an encryption policy",
    });
    let counted = await questionnairesRepo.refreshCounts(org.id, q.id);
    expect(counted).toMatchObject({ questionCount: 4, draftedCount: 3, approvedCount: 0, needsEvidenceCount: 1 });
    expect((await questionsRepo.nextPending(org.id, q.id)).map((x) => x.rowNumber)).toEqual([5]);
    expect((await questionsRepo.getById(org.id, batch[2].id))?.confidence).toBe(1);

    const stored = await questionsRepo.getById(org.id, batch[0].id);
    expect(stored?.citations).toEqual([{ chunkId: "00000000-0000-0000-0000-000000000001", quote: "MFA is required" }]);

    // Bulk approve above 0.8 approves only the first.
    const approved = await questionsRepo.bulkApprove(org.id, q.id, reviewer, 0.8);
    expect(approved.map((x) => x.id)).toEqual([batch[0].id]);
    expect(approved[0]).toMatchObject({ status: "approved", final: "Yes. MFA is enforced.", reviewedBy: reviewer });

    // An approved answer is never overwritten by a late draft.
    expect(await questionsRepo.updateDraft(org.id, batch[0].id, { draft: "late", status: "drafted" })).toBeNull();

    // Edit then approve.
    const edited = await questionsRepo.review(org.id, batch[1].id, reviewer, { action: "approve", final: "  Partially, see SOC 2.  " });
    expect(edited).toMatchObject({ status: "approved", final: "Partially, see SOC 2." });
    const na = await questionsRepo.review(org.id, batch[2].id, reviewer, { action: "not_applicable" });
    expect(na).toMatchObject({ status: "not_applicable", final: "Not applicable." });
    const reopened = await questionsRepo.review(org.id, batch[2].id, reviewer, { action: "reopen" });
    expect(reopened).toMatchObject({ status: "drafted", final: null, reviewedBy: null });
    const task = await questionsRepo.review(org.id, batch[2].id, reviewer, { action: "needs_evidence", notes: "Write a key management policy" });
    expect(task).toMatchObject({ status: "needs_evidence", notes: "Write a key management policy" });

    expect(await questionsRepo.counts(org.id, q.id)).toEqual({
      total: 4,
      pending: 1,
      drafted: 0,
      needs_evidence: 1,
      not_applicable: 0,
      approved: 2,
    });
    counted = await questionnairesRepo.getById(org.id, q.id);
    expect(counted).toMatchObject({ questionCount: 4, draftedCount: 3, approvedCount: 2, needsEvidenceCount: 1 });
    expect(await questionsRepo.countApproved(org.id)).toBe(2);
    expect((await questionsRepo.listNeedsEvidence(org.id)).map((x) => x.text)).toEqual(["Question 3?"]);
    expect((await questionsRepo.listForQuestionnaire(org.id, q.id, { status: "approved" })).length).toBe(2);

    // Sidebar badge counts needs_evidence only on in-review questionnaires.
    expect(await questionsRepo.getOpenCount(org.id)).toBe(0);
    await questionnairesRepo.updateStatus(org.id, q.id, "review");
    expect(await questionsRepo.getOpenCount(org.id)).toBe(1);

    // Org isolation.
    const other = await insertOrg(handle);
    expect(await questionnairesRepo.getById(other.id, q.id)).toBeNull();
    expect(await questionsRepo.listForQuestionnaire(other.id, q.id)).toEqual([]);
    expect(await questionsRepo.review(other.id, batch[0].id, reviewer, { action: "reopen" })).toBeNull();
    expect(await questionsRepo.getOpenCount(other.id)).toBe(0);
    await expect(questionsRepo.bulkInsert(other.id, q.id, [{ rowNumber: 99, text: "x" }])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("shares by public id on the questionnaire and through expiring share links", async () => {
    const org = await insertOrg(handle);
    const q = await seedQuestionnaire(org.id, 1);
    const publicId = await questionnairesRepo.setPublicId(org.id, q.id);
    expect(publicId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await questionnairesRepo.getByPublicId(publicId!))?.id).toBe(q.id);
    expect(await questionnairesRepo.setPublicId(org.id, q.id, null)).toBeNull();
    expect(await questionnairesRepo.getByPublicId(publicId!)).toBeNull();

    const now = new Date();
    const link = await shareLinksRepo.create(org.id, q.id, { ttlDays: 7, now });
    expect(link.publicId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await shareLinksRepo.getByPublicId(link.publicId, now))?.questionnaireId).toBe(q.id);
    const later = new Date(now.getTime() + 8 * DAY);
    expect(await shareLinksRepo.getByPublicId(link.publicId, later)).toBeNull();
    expect(await shareLinksRepo.purgeExpired(later)).toBeGreaterThanOrEqual(1);
    expect(await shareLinksRepo.listForQuestionnaire(org.id, q.id)).toEqual([]);

    const other = await insertOrg(handle);
    await expect(shareLinksRepo.create(other.id, q.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("library answers", () => {
  it("upserts approved answers by question, without duplicates", async () => {
    const org = await insertOrg(handle);
    const q = await seedQuestionnaire(org.id, 1);
    const [question] = await questionsRepo.listForQuestionnaire(org.id, q.id);
    await questionsRepo.updateDraft(org.id, question.id, { draft: "Yes, AES-256.", status: "drafted", confidence: 0.9 });
    const reviewer = await insertUser();
    await questionsRepo.review(org.id, question.id, reviewer.id, { action: "approve" });

    const first = await libraryRepo.upsertFromQuestion(org.id, { questionId: question.id, embedding: fakeEmbedding(20) });
    expect(first).toMatchObject({
      question: "Question 1?",
      answer: "Yes, AES-256.",
      source: "questionnaire",
      questionnaireId: q.id,
      questionId: question.id,
    });

    const second = await libraryRepo.upsertFromQuestion(org.id, { questionId: question.id, answer: "Yes, AES-256 at rest and TLS 1.2+ in transit." });
    expect(second.id).toBe(first.id);
    expect(second.answer).toMatch(/TLS/);
    expect(await libraryRepo.countForOrg(org.id)).toBe(1);
    // Same question text: the existing embedding is kept.
    expect(await libraryRepo.listMissingEmbeddings(org.id)).toEqual([]);
    // Changed question text without a new embedding: invalidated for re-embedding.
    await libraryRepo.upsertFromQuestion(org.id, { questionId: question.id, question: "Is data encrypted?" });
    expect((await libraryRepo.listMissingEmbeddings(org.id)).map((r) => r.id)).toEqual([first.id]);

    const other = await insertOrg(handle);
    await expect(libraryRepo.upsertFromQuestion(other.id, { questionId: question.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("imports past answers and searches them by embedding", async () => {
    const org = await insertOrg(handle);
    const inserted = await libraryRepo.insertMany(org.id, [
      { question: "Do you have a SOC 2 report?", answer: "Yes, Type II.", embedding: fakeEmbedding(30) },
      { question: "Do you encrypt backups?", answer: "Yes.", embedding: fakeEmbedding(31) },
      { question: "Is there a DPO?", answer: "Yes.", embedding: fakeEmbedding(32) },
      { question: "   ", answer: "skipped" },
    ]);
    expect(inserted).toHaveLength(3);
    expect(inserted.every((r) => r.source === "import")).toBe(true);

    const hits = await libraryRepo.searchByEmbedding(org.id, fakeEmbedding(31, { axis: 30, weight: 0.2 }), 2);
    expect(hits.map((h) => h.question)).toEqual(["Do you encrypt backups?", "Do you have a SOC 2 report?"]);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);

    expect((await libraryRepo.listForOrg(org.id, { search: "soc 2" })).map((r) => r.answer)).toEqual(["Yes, Type II."]);
    expect(await libraryRepo.searchByEmbedding((await insertOrg(handle)).id, fakeEmbedding(31))).toEqual([]);
    expect(await libraryRepo.remove(org.id, inserted[0].id)).toBe(true);
    expect(await libraryRepo.countForOrg(org.id)).toBe(2);
  });
});

let userCounter = 0;
async function insertUser() {
  userCounter += 1;
  const id = `user-${userCounter}-${Math.random().toString(36).slice(2, 8)}`;
  await handle.db.execute(sql`insert into attestly."user" (id, name, email) values (${id}, 'U', ${`${id}@example.com`})`);
  return { id };
}

describe("outbox", () => {
  it("inserts and lists per org", async () => {
    const org = await insertOrg(handle);
    const msg = await outboxRepo.insert(org.id, { toEmail: "a@b.c", subject: "Drafting done", text: "Done", kind: "drafting_done" });
    expect(msg).toMatchObject({ status: "queued", provider: "outbox", kind: "drafting_done" });
    expect((await outboxRepo.listForOrg(org.id)).map((m) => m.id)).toEqual([msg.id]);
    expect(await outboxRepo.listForOrg((await insertOrg(handle)).id)).toEqual([]);
  });
});

describe("agent_events", () => {
  it("is append-only: insert works, update/delete/truncate are rejected", async () => {
    const org = await insertOrg(handle);
    await logAgentEvent(handle.db, {
      orgId: org.id,
      actor: "agent",
      type: "question.drafted",
      entityType: "question",
      input: { questionId: "x" },
      meta: { model: "fake", promptVersion: "v1", tokensIn: 10, tokensOut: 5, latencyMs: 12, attempts: 1 },
    });
    await logAgentEvent(handle.db, { orgId: null, actor: "cron", type: "share_links.purged" });
    const rows = await handle.db.select().from(agentEvents).where(eq(agentEvents.orgId, org.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ model: "fake", promptVersion: "v1", tokensIn: 10, tokensOut: 5, latencyMs: 12 });

    expect(await dbErrorMessage(handle.db.update(agentEvents).set({ type: "tampered" }))).toMatch(/append-only/);
    expect(await dbErrorMessage(handle.db.delete(agentEvents))).toMatch(/append-only/);
    expect(await dbErrorMessage(handle.db.execute(sql`truncate attestly.agent_events`))).toMatch(/append-only/);

    // Deleting the whole organization cascades through the trigger.
    await handle.db.delete(organizations).where(eq(organizations.id, org.id));
    expect(await handle.db.select().from(agentEvents).where(eq(agentEvents.orgId, org.id))).toEqual([]);
  });
});
