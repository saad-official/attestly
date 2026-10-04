import "server-only";
import * as documentsRepo from "@/lib/db/repositories/documents";
import * as libraryRepo from "@/lib/db/repositories/libraryAnswers";
import * as questionnairesRepo from "@/lib/db/repositories/questionnaires";
import * as questionsRepo from "@/lib/db/repositories/questions";
import type { QuestionnaireStatus } from "@/lib/db/types";
import { errorMessage } from "./errors";
import { MINUTES_SAVED_PER_ANSWER } from "./plan-limits";
import { knowledgeGaps, type KnowledgeGap } from "./questionnaires";
import type { ServiceDeps } from "./shared";

/** Dashboard numbers (spec 3.6). */

export type QuestionnaireProgress = {
  id: string;
  name: string;
  customer: string | null;
  status: QuestionnaireStatus;
  createdAt: Date;
  updatedAt: Date;
  questionCount: number;
  /** Processed by the agent (anything not pending). */
  draftedCount: number;
  approvedCount: number;
  needsEvidenceCount: number;
  /** Drafted and waiting for review (processed minus approved, needs evidence and not applicable). */
  awaitingReviewCount: number;
  notApplicableCount: number;
  pendingCount: number;
  /** 0..1: approved + not applicable over all questions. */
  completion: number;
};

export type DashboardMetrics = {
  /** Questionnaires not yet done (mapping, drafting, review), newest first. */
  inProgress: QuestionnaireProgress[];
  /** All questionnaires ever created (any status). */
  questionnaireCount: number;
  approvedAnswers: number;
  /** approved answers x 4 minutes, in hours, one decimal. */
  hoursSaved: number;
  knowledge: { documents: number; chunks: number; indexing: number };
  libraryCount: number;
  gaps: KnowledgeGap[];
  /** Set when gap clustering failed (the rest of the dashboard still renders). */
  gapsError: string | null;
};

export async function dashboardMetrics(orgId: string, deps?: ServiceDeps): Promise<DashboardMetrics> {
  const [all, approvedAnswers, stats, libraryCount] = await Promise.all([
    questionnairesRepo.listForOrg(orgId, { limit: 200 }),
    questionsRepo.countApproved(orgId),
    documentsRepo.statsForOrg(orgId),
    libraryRepo.countForOrg(orgId),
  ]);

  const open = all.filter((q) => q.status !== "done").slice(0, 20);
  const inProgress = await Promise.all(
    open.map(async (q): Promise<QuestionnaireProgress> => {
      const counts = await questionsRepo.counts(orgId, q.id);
      return {
        id: q.id,
        name: q.name,
        customer: q.customer,
        status: q.status,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        questionCount: counts.total,
        draftedCount: counts.total - counts.pending,
        approvedCount: counts.approved,
        needsEvidenceCount: counts.needs_evidence,
        awaitingReviewCount: counts.drafted,
        notApplicableCount: counts.not_applicable,
        pendingCount: counts.pending,
        completion: counts.total === 0 ? 0 : (counts.approved + counts.not_applicable) / counts.total,
      };
    }),
  );

  let gaps: KnowledgeGap[] = [];
  let gapsError: string | null = null;
  try {
    gaps = await knowledgeGaps(orgId, deps);
  } catch (error) {
    gapsError = errorMessage(error);
    console.warn("[dashboard] knowledge gaps failed:", gapsError);
  }

  return {
    inProgress,
    questionnaireCount: all.length,
    approvedAnswers,
    hoursSaved: Math.round(((approvedAnswers * MINUTES_SAVED_PER_ANSWER) / 60) * 10) / 10,
    knowledge: { documents: stats.documents, chunks: stats.chunks, indexing: stats.pending },
    libraryCount,
    gaps,
    gapsError,
  };
}
