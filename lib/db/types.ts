/**
 * Row types inferred from lib/db/schema.ts. Type-only: safe to import from
 * client components (e.g. `Plan`, `QuestionStatus` in the app shell and grid).
 */
import type {
  agentEvents,
  chunks,
  documents,
  libraryAnswers,
  memberships,
  organizations,
  outbox,
  questionnaires,
  questions,
  session,
  shareLinks,
  user,
} from "./schema";

export type { Db, DbHandle, Schema } from "./client";
export type { CitationRef } from "./schema";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Plan = Organization["plan"];

export type Membership = typeof memberships.$inferSelect;
export type MembershipRole = Membership["role"];

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentKind = Document["kind"];
export type DocumentStatus = Document["status"];
/** A document without its `original` bytes (what list and detail queries return). */
export type DocumentSummary = Omit<Document, "original">;

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;

export type LibraryAnswer = typeof libraryAnswers.$inferSelect;
export type NewLibraryAnswer = typeof libraryAnswers.$inferInsert;
export type LibrarySource = LibraryAnswer["source"];
/** A library answer without its embedding. */
export type LibraryAnswerSummary = Omit<LibraryAnswer, "embedding">;

export type Questionnaire = typeof questionnaires.$inferSelect;
export type NewQuestionnaire = typeof questionnaires.$inferInsert;
export type QuestionnaireStatus = Questionnaire["status"];
/** A questionnaire without its `original` workbook bytes. */
export type QuestionnaireSummary = Omit<Questionnaire, "original">;

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type QuestionStatus = Question["status"];

export type ShareLink = typeof shareLinks.$inferSelect;

export type OutboxMessage = typeof outbox.$inferSelect;
export type NewOutboxMessage = typeof outbox.$inferInsert;

export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;
export type Actor = AgentEvent["actor"];
