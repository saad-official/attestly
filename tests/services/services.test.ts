import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbHandle } from "@/lib/db/client";
import * as chunksRepo from "@/lib/db/repositories/chunks";
import * as libraryRepo from "@/lib/db/repositories/libraryAnswers";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import { agentEvents, chunks, libraryAnswers } from "@/lib/db/schema";
import type { Organization } from "@/lib/db/types";
import { DEMO_QUESTIONS } from "@/lib/demo/questionnaire";
import { createFakeEmbedder } from "@/lib/rag/embeddings";
import { loadWorkbook } from "@/lib/sheets/cells";
import { seedDemoWorkspace, clearDemoWorkspace } from "@/lib/services/demo";
import { ServiceError } from "@/lib/services/errors";
import {
  assertPageQuota,
  deleteDocument,
  knowledgeStats,
  listDocuments,
  pasteDocument,
  reindexDocument,
  uploadDocument,
} from "@/lib/services/knowledge";
import {
  addLibraryAnswer,
  deleteLibraryAnswer,
  exportLibraryCsv,
  importLibraryFromWorkbook,
  listLibrary,
} from "@/lib/services/library";
import { runDailyMaintenance } from "@/lib/services/maintenance";
import { dashboardMetrics } from "@/lib/services/metrics";
import { PlanLimitError } from "@/lib/services/plan-limits";
import {
  bulkApprove,
  confirmMapping,
  createQuestionnaireFromUpload,
  createShareLink,
  draftBatch,
  exportQuestionnaire,
  getMappingPreview,
  getQuestionnaireDetail,
  getSharedQuestionnaire,
  knowledgeGaps,
  reviewQuestion,
} from "@/lib/services/questionnaires";
import { insertOrg, queryRows, startTestDb, stopTestDb } from "../db/helpers";
import { createFailingEmbedder, createFakeDrafter } from "./fakes";

let handle: DbHandle;
const embedder = createFakeEmbedder();
const USER_ID = "user-reviewer-1";

beforeAll(async () => {
  handle = await startTestDb();
  await handle.db.execute(
    sql`insert into attestly."user" (id, name, email) values (${USER_ID}, 'Reviewer', 'reviewer@example.test')`,
  );
}, 120_000);

afterAll(async () => {
  await stopTestDb(handle);
});

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function expectPlanLimit(promise: Promise<unknown>, code: PlanLimitError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PlanLimitError);
  expect((error as PlanLimitError).code).toBe(code);
}

function csvOf(rows: string[][]): string {
  return rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
}

const NOT_COVERED = DEMO_QUESTIONS.filter((q) => q.expected === "not_covered").map((q) => q.text);
const FAILING = DEMO_QUESTIONS.find((q) => q.ref === "ORG-08")!.text;

describe("demo workspace end to end", () => {
  let org: Organization;
  let questionnaireId: string;
  const drafter = createFakeDrafter({ needsEvidence: NOT_COVERED.filter((t) => t !== FAILING), failOn: [FAILING] });
  const draftDeps = { embedder, generate: drafter, delayMs: 0 };

  beforeAll(async () => {
    org = await insertOrg(handle, "Northbeam Software");
  });

  it("seeds six policies, twelve library answers and the 40-question questionnaire", async () => {
    const result = await seedDemoWorkspace(org, { embedder });
    expect(result.documents).toBe(6);
    expect(result.libraryAnswers).toBe(12);
    expect(result.created).toBe(true);
    questionnaireId = result.questionnaireId;

    const detail = await getQuestionnaireDetail(org.id, questionnaireId);
    expect(detail?.questionnaire.status).toBe("drafting");
    expect(detail?.questions).toHaveLength(40);
    expect(detail?.questionnaire.questionCount).toBe(40);
    expect(detail?.mapping?.columns).toMatchObject({ question: 2, answer: 3, comment: 4, id: 1 });
    expect(detail?.questions[0]).toMatchObject({ externalId: "ORG-01", section: "Organisation", status: "pending" });

    const docs = await listDocuments(org.id);
    expect(docs).toHaveLength(6);
    expect(docs.every((d) => d.status === "ready" && d.chunkCount > 0 && d.isDemo)).toBe(true);
    const missing = await queryRows<{ n: number }>(
      handle,
      sql`select count(*)::int as n from attestly.chunks where org_id = ${org.id} and embedding is null`,
    );
    expect(missing[0].n).toBe(0);
  });

  it("is idempotent", async () => {
    const again = await seedDemoWorkspace(org, { embedder });
    expect(again).toMatchObject({ documents: 6, libraryAnswers: 12, questionnaireId, created: false });
    expect(await listDocuments(org.id)).toHaveLength(6);
    expect(await listLibrary(org.id)).toHaveLength(12);
  });

  it("drafts in batches of 15 until nothing is pending, then moves to review", async () => {
    const first = await draftBatch(org.id, questionnaireId, { limit: 15, deps: draftDeps });
    expect(first).toMatchObject({ processed: 15, remaining: 25, status: "drafting", busy: false });
    const second = await draftBatch(org.id, questionnaireId, { limit: 15, deps: draftDeps });
    expect(second).toMatchObject({ processed: 15, remaining: 10, status: "drafting" });
    const third = await draftBatch(org.id, questionnaireId, { limit: 15, deps: draftDeps });
    expect(third).toMatchObject({ processed: 10, remaining: 0, status: "review" });
    // ORG-08 (model error) is in the first batch; the batch carried on.
    expect([first.failed, second.failed, third.failed]).toEqual([1, 0, 0]);
    expect(drafter.calls).toHaveLength(40);

    const idle = await draftBatch(org.id, questionnaireId, { deps: draftDeps });
    expect(idle).toMatchObject({ processed: 0, remaining: 0, status: "review" });
    expect(drafter.calls).toHaveLength(40);
  });

  it("stores citations that resolve to real chunks of the org", async () => {
    const detail = (await getQuestionnaireDetail(org.id, questionnaireId))!;
    const drafted = detail.questions.filter((q) => q.status === "drafted");
    expect(drafted.length).toBeGreaterThan(25);
    const chunkIds = drafted.flatMap((q) => q.citations.map((c) => c.chunkId ?? c.libraryAnswerId!));
    expect(chunkIds.length).toBeGreaterThanOrEqual(drafted.length);
    for (const q of drafted) {
      expect(q.citations.length).toBeGreaterThan(0);
      expect(q.retrieval).toMatchObject({ evidence: expect.any(Array) });
      for (const c of q.citations) {
        const id = c.chunkId ?? c.libraryAnswerId!;
        const source = detail.sourcesById[id];
        expect(source, `citation ${id}`).toBeDefined();
        expect(source.text).toContain(c.quote.split(" ")[0]);
      }
    }
    const citedChunks = [...new Set(drafted.flatMap((q) => q.citations.map((c) => c.chunkId).filter(Boolean) as string[]))];
    const rows = await chunksRepo.getByIds(org.id, citedChunks);
    expect(rows).toHaveLength(citedChunks.length);

    const events = await handle.db
      .select()
      .from(agentEvents)
      .where(and(eq(agentEvents.orgId, org.id), eq(agentEvents.type, "question.drafted")));
    expect(events.length).toBe(39);
    expect(events.find((e) => e.model === "fake-model")).toBeDefined();
  });

  it("marks a question whose model call fails as needs_evidence and keeps going", async () => {
    const detail = (await getQuestionnaireDetail(org.id, questionnaireId))!;
    const failed = detail.questions.find((q) => q.text === FAILING)!;
    expect(failed.status).toBe("needs_evidence");
    expect(failed.notes).toMatch(/^Drafting failed/);
    const notCovered = detail.questions.filter((q) => NOT_COVERED.includes(q.text));
    expect(notCovered.every((q) => q.status === "needs_evidence")).toBe(true);
    expect(detail.questionnaire.needsEvidenceCount).toBe(NOT_COVERED.length);
  });

  it("approving upserts the answer into the library; editing replaces the final text", async () => {
    const detail = (await getQuestionnaireDetail(org.id, questionnaireId))!;
    const [a, b] = detail.questions.filter((q) => q.status === "drafted");
    const before = (await listLibrary(org.id)).length;

    const approved = await reviewQuestion(org.id, a.id, { action: "approve" }, USER_ID, { embedder });
    expect(approved.question.status).toBe("approved");
    expect(approved.question.final).toBe(a.draft);
    expect(approved.libraryAnswerId).toBeTruthy();
    const [entry] = await libraryRepo.getByIds(org.id, [approved.libraryAnswerId!]);
    expect(entry).toMatchObject({ source: "questionnaire", questionId: a.id, answer: a.draft, question: a.text });
    const [withVector] = await handle.db
      .select({ id: libraryAnswers.id })
      .from(libraryAnswers)
      .where(and(eq(libraryAnswers.id, entry.id), sql`${libraryAnswers.embedding} is not null`));
    expect(withVector).toBeDefined();
    expect(await listLibrary(org.id)).toHaveLength(before + 1);

    const edited = await reviewQuestion(
      org.id,
      b.id,
      { action: "edit", final: "Edited answer: we review this every quarter." },
      USER_ID,
      { embedder },
    );
    expect(edited.question).toMatchObject({ status: "approved", final: "Edited answer: we review this every quarter." });
    expect(edited.questionnaire.approvedCount).toBe(2);

    // Re-approving the same question updates its library entry in place.
    await reviewQuestion(org.id, b.id, { action: "reopen" }, USER_ID);
    const again = await reviewQuestion(org.id, b.id, { action: "edit", final: "Second edit." }, USER_ID, { embedder });
    expect(again.libraryAnswerId).toBe(edited.libraryAnswerId);
    expect(await listLibrary(org.id)).toHaveLength(before + 2);

    await expect(reviewQuestion(org.id, b.id, { action: "edit", final: "  " }, USER_ID)).rejects.toBeInstanceOf(ServiceError);
    const failed = detail.questions.find((q) => q.text === FAILING)!;
    await expect(reviewQuestion(org.id, failed.id, { action: "approve" }, USER_ID)).rejects.toBeInstanceOf(ServiceError);
  });

  it("exports CSV with the approved answer and needs-evidence comments", async () => {
    const file = await exportQuestionnaire(org.id, questionnaireId, "csv");
    expect(file.fileName).toBe("acme-corp-vendor-security-questionnaire-attestly.csv");
    expect(file.contentType).toMatch(/^text\/csv/);
    const text = dec(file.bytes);
    expect(text).toContain("Second edit.");
    expect(text).toContain("Needs evidence: Drafting failed");
    expect(text).toContain("ORG-01");
  });

  it("refuses XLSX export on Free and writes into the original workbook on Pro", async () => {
    await expectPlanLimit(exportQuestionnaire(org.id, questionnaireId, "xlsx"), "xlsx_export");
    await organizationsRepo.setPlan(org.id, { plan: "pro" });
    try {
      const file = await exportQuestionnaire(org.id, questionnaireId, "xlsx");
      expect(file.fileName).toBe("acme-corp-vendor-security-questionnaire-attestly.xlsx");
      const workbook = await loadWorkbook(file.bytes);
      const sheet = workbook.getWorksheet("Security Questionnaire")!;
      const detail = (await getQuestionnaireDetail(org.id, questionnaireId))!;
      const approved = detail.questions.find((q) => q.final === "Second edit.")!;
      expect(sheet.getCell(approved.rowNumber, 3).value).toBe("Second edit.");
      const failed = detail.questions.find((q) => q.text === FAILING)!;
      expect(String(sheet.getCell(failed.rowNumber, 4).value)).toMatch(/^Needs evidence: /);
      expect(sheet.getCell(4, 3).value).toBe("Vendor Response");
      expect(workbook.getWorksheet("Instructions")).toBeDefined();
    } finally {
      await organizationsRepo.setPlan(org.id, { plan: "free" });
    }
  });

  it("groups needs-evidence questions into knowledge gaps", async () => {
    const gaps = await knowledgeGaps(org.id, { embedder });
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps.reduce((n, g) => n + g.count, 0)).toBe(NOT_COVERED.length);
    for (const gap of gaps) {
      expect(gap.questionIds).toHaveLength(gap.count);
      expect(gap.label.split(" ").length).toBeLessThanOrEqual(6);
    }
  });

  it("computes dashboard metrics", async () => {
    const metrics = await dashboardMetrics(org.id, { embedder });
    expect(metrics.approvedAnswers).toBe(2);
    expect(metrics.hoursSaved).toBe(0.1);
    expect(metrics.inProgress).toHaveLength(1);
    expect(metrics.inProgress[0]).toMatchObject({ questionCount: 40, approvedCount: 2, pendingCount: 0 });
    expect(metrics.knowledge.documents).toBe(6);
    expect(metrics.libraryCount).toBe(14);
    expect(metrics.gaps.length).toBeGreaterThan(0);
  });

  it("bulk-approves drafted answers above a confidence threshold", async () => {
    const result = await bulkApprove(org.id, questionnaireId, 0.8, USER_ID, { embedder });
    expect(result.approved).toBeGreaterThan(20);
    expect(result.libraryAnswers).toBe(result.approved);
    const detail = (await getQuestionnaireDetail(org.id, questionnaireId))!;
    expect(detail.counts.drafted).toBe(0);
  });

  it("clears the demo workspace", async () => {
    const cleared = await clearDemoWorkspace(org.id);
    expect(cleared.documents).toBe(6);
    expect(cleared.questionnaires).toBe(1);
    expect(await listDocuments(org.id)).toHaveLength(0);
    expect(await listLibrary(org.id)).toHaveLength(0);
    expect(await getQuestionnaireDetail(org.id, questionnaireId)).toBeNull();
  });
});

describe("Free plan limits", () => {
  it("allows one questionnaire a month (the demo does not count)", async () => {
    const org = await insertOrg(handle, "Limits Co");
    await seedDemoWorkspace(org, { embedder });
    const csv = enc(csvOf([["Question", "Answer"], ["Do you encrypt data at rest?", ""], ["Do you use MFA?", ""]]));
    const first = await createQuestionnaireFromUpload(org, {
      fileName: "first.csv",
      mimeType: "text/csv",
      bytes: csv,
      name: "First",
      customer: "Initech",
    });
    expect(first.questionnaire.status).toBe("mapping");
    expect(first.preview.map((p) => p.text)).toEqual(["Do you encrypt data at rest?", "Do you use MFA?"]);
    const confirmed = await confirmMapping(org.id, first.questionnaire.id, first.mapping);
    expect(confirmed.questionCount).toBe(2);
    expect(confirmed.questionnaire.status).toBe("drafting");
    await expect(confirmMapping(org.id, first.questionnaire.id, first.mapping)).rejects.toMatchObject({ code: "conflict" });

    await expectPlanLimit(
      createQuestionnaireFromUpload(org, { fileName: "second.csv", mimeType: "text/csv", bytes: csv, name: "Second" }),
      "questionnaires_per_month",
    );
  });

  it("caps a Free questionnaire at 100 questions", async () => {
    const org = await insertOrg(handle, "Big Sheet Co");
    const rows = [["ID", "Question", "Response"]];
    for (let i = 1; i <= 101; i++) rows.push([`Q-${i}`, `Do you have control number ${i} in place?`, ""]);
    const upload = await createQuestionnaireFromUpload(org, {
      fileName: "big.csv",
      mimeType: "text/csv",
      bytes: enc(csvOf(rows)),
      name: "Big",
    });
    expect(upload.questionCount).toBe(101);
    await expectPlanLimit(confirmMapping(org.id, upload.questionnaire.id, upload.mapping), "questions_per_questionnaire");
  });

  it("caps the knowledge base at 25 pages of 500 words", async () => {
    const org = await insertOrg(handle, "Wordy Co");
    const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 50}`).join(" ");
    await pasteDocument(org.id, { title: "Twenty pages", text: `# Policy\n\n${words(20 * 500 - 2)}` }, { embedder });
    await expectPlanLimit(
      pasteDocument(org.id, { title: "Six more", text: `# More\n\n${words(6 * 500)}` }, { embedder }),
      "pages",
    );
    await expect(assertPageQuota(org, 5)).resolves.toBeUndefined();
    await expectPlanLimit(assertPageQuota(org, 6), "pages");
    await expect(assertPageQuota({ ...org, plan: "pro" }, 1000)).resolves.toBeUndefined();
    const stats = await knowledgeStats(org.id);
    expect(stats).toMatchObject({ documents: 1, pagesUsed: 20, pageLimit: 25 });
  });

  it("keeps share links and the library export for Pro", async () => {
    const org = await insertOrg(handle, "Share Co");
    const upload = await createQuestionnaireFromUpload(org, {
      fileName: "q.csv",
      mimeType: "text/csv",
      bytes: enc(csvOf([["Question", "Answer"], ["Is data encrypted?", ""]])),
      name: "Shared",
    });
    await confirmMapping(org.id, upload.questionnaire.id, upload.mapping);
    await expectPlanLimit(createShareLink(org.id, upload.questionnaire.id), "share_links");
    await expectPlanLimit(exportLibraryCsv(org.id), "library_export");

    await organizationsRepo.setPlan(org.id, { plan: "pro" });
    const link = await createShareLink(org.id, upload.questionnaire.id, 14);
    expect(link.path).toBe(`/s/${link.publicId}`);
    const shared = await getSharedQuestionnaire(link.publicId);
    expect(shared?.questionnaire.name).toBe("Shared");
    expect(shared?.companyName).toBe("Share Co");
    expect(shared?.questions).toHaveLength(1);
    expect(shared?.questions[0]).not.toHaveProperty("reviewedBy");
    expect(await getSharedQuestionnaire("nope-not-a-real-link")).toBeNull();

    await addLibraryAnswer(org.id, { question: "=cmd|' /C calc'!A0", answer: "Yes, we do." }, { embedder });
    const csv = await exportLibraryCsv(org.id);
    expect(csv).toContain("Yes, we do.");
    expect(csv).toContain("'=cmd");

    const purged = await runDailyMaintenance({ embedder, now: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) });
    expect(purged.purgedShareLinks).toBeGreaterThanOrEqual(1);
    expect(await getSharedQuestionnaire(link.publicId)).toBeNull();
  });
});

describe("knowledge and library services", () => {
  it("uploads a Markdown file, rejects unsupported types and re-indexes", async () => {
    const org = await insertOrg(handle, "Docs Co");
    const md = "# Backup Policy\n\nBackups are taken daily and kept for 35 days in a separate account.\n\n## Restores\n\nRestores are tested every quarter by the platform team.";
    const doc = await uploadDocument(
      org.id,
      { fileName: "backup-policy.md", mimeType: "text/markdown", bytes: enc(md), kind: "policy" },
      { embedder },
    );
    expect(doc).toMatchObject({ title: "backup policy", status: "ready", fileName: "backup-policy.md" });
    expect(doc.chunkCount).toBeGreaterThan(0);

    await expect(
      uploadDocument(org.id, { fileName: "x.exe", mimeType: "application/octet-stream", bytes: enc("MZ"), kind: "policy" }),
    ).rejects.toMatchObject({ code: "unsupported_file" });

    const next = await reindexDocument(org.id, doc.id, { embedder });
    expect(next.id).not.toBe(doc.id);
    expect(next.status).toBe("ready");
    const docs = await listDocuments(org.id);
    expect(docs.map((d) => d.id)).toEqual([next.id]);
    // The superseded version's chunks still resolve for old citations.
    const oldChunks = await chunksRepo.listForDocument(org.id, doc.id);
    expect(oldChunks.length).toBeGreaterThan(0);
    expect(await chunksRepo.getByIds(org.id, [oldChunks[0].id])).toHaveLength(1);

    expect(await deleteDocument(org.id, next.id)).toBe(true);
    expect(await deleteDocument(org.id, next.id)).toBe(false);
    expect(await deleteDocument(org.id, "not-a-uuid")).toBe(false);
  });

  it("stores chunks without vectors when embedding fails, and the daily job fills them in", async () => {
    const org = await insertOrg(handle, "Flaky Co");
    const doc = await pasteDocument(
      org.id,
      { title: "Incident Response", text: "# Incident Response\n\nWe notify affected customers within 72 hours of confirming a breach." },
      { embedder: createFailingEmbedder() },
    );
    expect(doc.status).toBe("ready");
    expect(doc.error).toMatch(/pending/);
    const missing = () =>
      handle.db.select({ id: chunks.id }).from(chunks).where(and(eq(chunks.orgId, org.id), isNull(chunks.embedding)));
    expect((await missing()).length).toBe(doc.chunkCount);

    const result = await runDailyMaintenance({ embedder });
    expect(result.chunks.embedded).toBeGreaterThanOrEqual(doc.chunkCount);
    expect(result.skipped).toBeNull();
    expect(await missing()).toHaveLength(0);
  });

  it("imports a past questionnaire into the library, skipping blanks and duplicates", async () => {
    const org = await insertOrg(handle, "Library Co");
    const csv = enc(
      csvOf([
        ["Question", "Answer"],
        ["Do you encrypt data at rest?", "Yes, with AES-256."],
        ["Do you have a DPO?", ""],
        ["Do you run penetration tests?", "Yes, annually."],
      ]),
    );
    const first = await importLibraryFromWorkbook(org.id, csv, undefined, { embedder, fileName: "past.csv" });
    expect(first).toMatchObject({ imported: 2, skippedEmpty: 1, skippedDuplicates: 0, embedded: true });
    const again = await importLibraryFromWorkbook(org.id, csv, undefined, { embedder, fileName: "past.csv" });
    expect(again).toMatchObject({ imported: 0, skippedDuplicates: 2 });

    const manual = await addLibraryAnswer(org.id, { question: "Where is data hosted?", answer: "AWS eu-west-1." }, { embedder });
    expect(manual.source).toBe("manual");
    const library = await listLibrary(org.id);
    expect(library).toHaveLength(3);
    expect(await deleteLibraryAnswer(org.id, manual.id)).toBe(true);
    expect(await listLibrary(org.id)).toHaveLength(2);
  });

  it("aborts a batch without touching rows when no AI provider is configured", async () => {
    const org = await insertOrg(handle, "No Key Co");
    const upload = await createQuestionnaireFromUpload(org, {
      fileName: "k.csv",
      mimeType: "text/csv",
      bytes: enc(csvOf([["Question", "Answer"], ["Is MFA enforced?", ""], ["Are backups encrypted?", ""]])),
      name: "No key",
    });
    await expect(draftBatch(org.id, upload.questionnaire.id, { deps: { embedder } })).rejects.toMatchObject({
      code: "conflict",
    });
    await confirmMapping(org.id, upload.questionnaire.id, upload.mapping);
    const unavailable = Object.assign(new Error("No LLM provider is configured."), { name: "AiUnavailableError" });
    await expect(
      draftBatch(org.id, upload.questionnaire.id, {
        deps: { embedder, delayMs: 0, generate: async () => Promise.reject(unavailable) },
      }),
    ).rejects.toThrow("No LLM provider");
    const detail = (await getQuestionnaireDetail(org.id, upload.questionnaire.id))!;
    expect(detail.counts.pending).toBe(2);
  });

  it("re-reads the mapping preview with a user override", async () => {
    const org = await insertOrg(handle, "Mapping Co");
    const upload = await createQuestionnaireFromUpload(org, {
      fileName: "m.csv",
      mimeType: "text/csv",
      bytes: enc(csvOf([["Ref", "Question", "Answer", "Notes"], ["1", "Is MFA enforced?", "", ""], ["2", "Are backups encrypted?", "", ""]])),
      name: "Mapping",
    });
    expect(upload.mapping.columns).toMatchObject({ question: 2, answer: 3, comment: 4 });
    const override = await getMappingPreview(org.id, upload.questionnaire.id, {
      columns: { question: 2, answer: 4 },
    });
    expect(override.mapping.columns).toEqual({ question: 2, answer: 4 });
    expect(override.questionCount).toBe(2);
    await expect(
      getMappingPreview(org.id, upload.questionnaire.id, { columns: { question: 2, answer: 2 } }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
