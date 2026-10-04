import type { DocumentStatus, QuestionStatus, QuestionnaireStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Status chips (design spec 6): drafted evergreen, needs evidence amber,
 * approved green, not applicable and pending muted. Amber text fails
 * contrast on white, so "needs evidence" uses the dark amber foreground for
 * its text and keeps amber for the dot and border. The dot is drawn by an
 * unlayered ::before rule in globals, hence the `!` overrides.
 */

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  pending: "Pending",
  drafted: "Drafted",
  needs_evidence: "Needs evidence",
  not_applicable: "Not applicable",
  approved: "Approved",
};

type Tone = "evergreen" | "amber" | "approved" | "muted" | "destructive";

const TONE: Record<Tone, string> = {
  evergreen: "bg-card text-evergreen",
  amber: "border-amber! bg-amber/15 text-amber-foreground before:bg-amber! dark:text-amber",
  approved: "bg-approved/10 text-approved",
  muted: "bg-card text-muted-foreground",
  destructive: "bg-destructive/5 text-destructive",
};

function Chip({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("status-chip whitespace-nowrap", TONE[tone], className)}>{children}</span>;
}

const QUESTION_TONE: Record<QuestionStatus, Tone> = {
  pending: "muted",
  drafted: "evergreen",
  needs_evidence: "amber",
  not_applicable: "muted",
  approved: "approved",
};

export function QuestionStatusChip({ status, className }: { status: QuestionStatus; className?: string }) {
  return (
    <Chip tone={QUESTION_TONE[status]} className={className}>
      {QUESTION_STATUS_LABEL[status]}
    </Chip>
  );
}

export const QUESTIONNAIRE_STATUS_LABEL: Record<QuestionnaireStatus, string> = {
  mapping: "Mapping",
  drafting: "Drafting",
  review: "In review",
  done: "Done",
};

const QUESTIONNAIRE_TONE: Record<QuestionnaireStatus, Tone> = {
  mapping: "muted",
  drafting: "evergreen",
  review: "amber",
  done: "approved",
};

export function QuestionnaireStatusChip({ status, className }: { status: QuestionnaireStatus; className?: string }) {
  return (
    <Chip tone={QUESTIONNAIRE_TONE[status]} className={className}>
      {QUESTIONNAIRE_STATUS_LABEL[status]}
    </Chip>
  );
}

const DOCUMENT_LABEL: Record<DocumentStatus, string> = {
  indexing: "Indexing",
  ready: "Indexed",
  failed: "Failed",
};

const DOCUMENT_TONE: Record<DocumentStatus, Tone> = {
  indexing: "muted",
  ready: "approved",
  failed: "destructive",
};

export function DocumentStatusChip({ status, className }: { status: DocumentStatus; className?: string }) {
  return (
    <Chip tone={DOCUMENT_TONE[status]} className={className}>
      {DOCUMENT_LABEL[status]}
    </Chip>
  );
}
