import "server-only";
import * as documentsRepo from "@/lib/db/repositories/documents";
import * as libraryRepo from "@/lib/db/repositories/libraryAnswers";
import * as questionnairesRepo from "@/lib/db/repositories/questionnaires";
import type { Organization } from "@/lib/db/types";
import { DEMO_LIBRARY } from "@/lib/demo/library";
import { DEMO_POLICIES } from "@/lib/demo/policies";
import {
  DEMO_CUSTOMER,
  DEMO_QUESTIONNAIRE_FILE_NAME,
  DEMO_QUESTIONNAIRE_NAME,
  buildDemoQuestionnaire,
} from "@/lib/demo/questionnaire";
import { pasteDocument } from "./knowledge";
import { confirmMapping, createQuestionnaireFromUpload, getMappingPreview } from "./questionnaires";
import { audit, embedInBatches, isDemoDocument, isDemoQuestionnaire, queryEmbedder, type ServiceDeps } from "./shared";
import { XLSX_MIME } from "./spreadsheet";

/**
 * Demo workspace (spec 3.7): six synthetic policies, a 12-answer library and
 * the 40-question "Acme Corp vendor security questionnaire", mapping already
 * confirmed (status "drafting"). The UI then drives drafting through
 * POST /api/questionnaires/[id]/draft. Demo content is exempt from the Free
 * limits. Idempotent: each of the three parts is only created when missing.
 */

export type SeedDemoResult = {
  /** Demo documents in the workspace after seeding. */
  documents: number;
  /** Demo library answers in the workspace after seeding. */
  libraryAnswers: number;
  questionnaireId: string;
  /** False when everything already existed (nothing was created). */
  created: boolean;
};

const DEMO_LIBRARY_QUESTIONS = new Set(DEMO_LIBRARY.map((a) => a.question));

async function findDemo(orgId: string) {
  const [docs, library, questionnaires] = await Promise.all([
    documentsRepo.listForOrg(orgId, { limit: 500 }),
    libraryRepo.listForOrg(orgId, { source: "import", limit: 1000 }),
    questionnairesRepo.listForOrg(orgId, { limit: 200 }),
  ]);
  return {
    documents: docs.filter(isDemoDocument),
    library: library.filter((a) => DEMO_LIBRARY_QUESTIONS.has(a.question)),
    questionnaires: questionnaires.filter(isDemoQuestionnaire),
  };
}

export async function seedDemoWorkspace(org: Organization, deps?: ServiceDeps): Promise<SeedDemoResult> {
  const existing = await findDemo(org.id);
  let created = false;

  const haveTitles = new Set(existing.documents.map((d) => d.title));
  let documents = existing.documents.length;
  for (const policy of DEMO_POLICIES) {
    if (haveTitles.has(policy.title)) continue;
    await pasteDocument(
      org.id,
      { title: policy.title, text: policy.markdown, kind: "policy", fileName: policy.fileName },
      { ...deps, skipPlanLimits: true },
    );
    documents += 1;
    created = true;
  }

  let libraryAnswers = existing.library.length;
  if (existing.library.length === 0) {
    let vectors: Array<number[] | null> = DEMO_LIBRARY.map(() => null);
    try {
      vectors = await embedInBatches(
        queryEmbedder(deps),
        DEMO_LIBRARY.map((a) => a.question),
      );
    } catch (error) {
      console.warn("[demo] library embedding failed; the daily job embeds later:", error instanceof Error ? error.message : error);
    }
    const inserted = await libraryRepo.insertMany(
      org.id,
      DEMO_LIBRARY.map((a, i) => ({ question: a.question, answer: a.answer, source: "import" as const, embedding: vectors[i] })),
    );
    libraryAnswers = inserted.length;
    created = true;
  }

  // Prefer a demo questionnaire that got past the mapping step; finish one left in "mapping".
  let questionnaire =
    existing.questionnaires.find((q) => q.status !== "mapping") ?? existing.questionnaires[0] ?? null;
  if (!questionnaire) {
    const bytes = await buildDemoQuestionnaire();
    const upload = await createQuestionnaireFromUpload(
      org,
      { fileName: DEMO_QUESTIONNAIRE_FILE_NAME, mimeType: XLSX_MIME, bytes, name: DEMO_QUESTIONNAIRE_NAME, customer: DEMO_CUSTOMER },
      { skipPlanLimits: true },
    );
    questionnaire = upload.questionnaire;
    created = true;
  }
  if (questionnaire.status === "mapping") {
    // Auto-confirm the detected mapping (Ref / Question / Vendor Response / Comments / Evidence).
    const { mapping } = await getMappingPreview(org.id, questionnaire.id);
    questionnaire = (await confirmMapping(org.id, questionnaire.id, mapping, { skipPlanLimits: true })).questionnaire;
    created = true;
  }

  if (created) {
    await audit({
      orgId: org.id,
      actor: "user",
      type: "demo.seeded",
      entityType: "organization",
      entityId: org.id,
      output: { documents, libraryAnswers, questionnaireId: questionnaire.id },
    });
  }
  return { documents, libraryAnswers, questionnaireId: questionnaire.id, created };
}

export type ClearDemoResult = {
  documents: number;
  libraryAnswers: number;
  questionnaires: number;
};

/**
 * Removes the demo workspace: the demo documents (and their chunks), the
 * imported demo library answers, the demo questionnaire(s) with their
 * questions, and library answers approved from those questions. User content
 * is untouched.
 */
export async function clearDemoWorkspace(orgId: string): Promise<ClearDemoResult> {
  const demo = await findDemo(orgId);
  const questionnaireIds = new Set(demo.questionnaires.map((q) => q.id));
  const fromDemoQuestions = (await libraryRepo.listForOrg(orgId, { source: "questionnaire", limit: 1000 })).filter(
    (a) => a.questionnaireId && questionnaireIds.has(a.questionnaireId),
  );

  let libraryAnswers = 0;
  for (const a of [...demo.library, ...fromDemoQuestions]) {
    if (await libraryRepo.remove(orgId, a.id)) libraryAnswers += 1;
  }
  let questionnaires = 0;
  for (const q of demo.questionnaires) {
    if (await questionnairesRepo.remove(orgId, q.id)) questionnaires += 1;
  }
  let documents = 0;
  // Superseded (re-indexed) demo versions too.
  const allVersions = (await documentsRepo.listForOrg(orgId, { includeSuperseded: true, limit: 500 })).filter(isDemoDocument);
  for (const d of allVersions) {
    if (await documentsRepo.remove(orgId, d.id)) documents += 1;
  }
  await audit({
    orgId,
    actor: "user",
    type: "demo.cleared",
    entityType: "organization",
    entityId: orgId,
    output: { documents, libraryAnswers, questionnaires },
  });
  return { documents, libraryAnswers, questionnaires };
}
