import type { Organization, Plan } from "@/lib/db/types";

/**
 * Plan limits (spec 2). Free: 1 questionnaire a calendar month (UTC) of up to
 * 100 questions, 25 policy pages, CSV export. Pro: unlimited questionnaires
 * and pages, XLSX round-trip export, answer library export, share links.
 *
 * The demo workspace (spec 3.7) is exempt: its documents and questionnaire do
 * not count towards the Free limits.
 *
 * Pure module (no database, no server-only) so client components can import
 * the constants and `isPlanLimitError` for upgrade prompts.
 */

export type PlanLimits = {
  /** null = unlimited. */
  questionnairesPerMonth: number | null;
  /** null = unlimited. */
  questionsPerQuestionnaire: number | null;
  /** Knowledge-base size in pages (WORDS_PER_PAGE words each); null = unlimited. */
  pages: number | null;
  xlsxExport: boolean;
  libraryExport: boolean;
  shareLinks: boolean;
};

export const PLAN_LIMITS: Readonly<Record<Plan, PlanLimits>> = {
  free: {
    questionnairesPerMonth: 1,
    questionsPerQuestionnaire: 100,
    pages: 25,
    xlsxExport: false,
    libraryExport: false,
    shareLinks: false,
  },
  pro: {
    questionnairesPerMonth: null,
    questionsPerQuestionnaire: null,
    pages: null,
    xlsxExport: true,
    libraryExport: true,
    shareLinks: true,
  },
};

export const FREE_QUESTIONNAIRES_PER_MONTH = 1;
export const FREE_QUESTIONS_PER_QUESTIONNAIRE = 100;
export const FREE_PAGES = 25;
/** A knowledge-base "page" is 500 words of extracted text. */
export const WORDS_PER_PAGE = 500;
/** Uploads (policies and questionnaires) are capped at 10 MB (spec 3.1). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Spec 3.6: each approved answer saves about four minutes. */
export const MINUTES_SAVED_PER_ANSWER = 4;
export const DEFAULT_SHARE_DAYS = 14;

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export type PlanLimitCode =
  | "questionnaires_per_month"
  | "questions_per_questionnaire"
  | "pages"
  | "xlsx_export"
  | "library_export"
  | "share_links";

/**
 * Thrown when an action exceeds the organization's plan. API routes map it to
 * HTTP 402; screens show `message` with an upgrade link to /billing.
 */
export class PlanLimitError extends Error {
  readonly code: PlanLimitCode;
  /** The limit that was hit (null for Pro-only features). */
  readonly limit: number | null;
  /** Current usage, when it applies. */
  readonly used: number | null;
  readonly upgradeUrl = "/billing";

  constructor(code: PlanLimitCode, message: string, details: { limit?: number | null; used?: number | null } = {}) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
    this.limit = details.limit ?? null;
    this.used = details.used ?? null;
  }
}

export function isPlanLimitError(error: unknown): error is PlanLimitError {
  return error instanceof PlanLimitError || (error instanceof Error && error.name === "PlanLimitError");
}

/** Pages for a text: words / 500, rounded up, at least 1 for any non-empty text. */
export function pagesForText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.split(/\s+/).length / WORDS_PER_PAGE));
}

/** First instant of the UTC calendar month containing `now`. */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First instant of the next UTC calendar month. */
export function nextMonthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Throws PlanLimitError unless the org's plan includes the Pro-only feature. */
export function assertProFeature(
  org: Pick<Organization, "plan">,
  feature: Extract<PlanLimitCode, "xlsx_export" | "library_export" | "share_links">,
): void {
  const limits = limitsFor(org.plan);
  const allowed =
    feature === "xlsx_export" ? limits.xlsxExport : feature === "library_export" ? limits.libraryExport : limits.shareLinks;
  if (allowed) return;
  const what =
    feature === "xlsx_export"
      ? "XLSX export into the customer's original workbook"
      : feature === "library_export"
        ? "Answer library export"
        : "Shareable review links";
  throw new PlanLimitError(feature, `${what} is a Pro feature. Upgrade to Pro to use it.`);
}
