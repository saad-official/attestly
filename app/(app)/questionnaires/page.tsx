import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DemoWorkspaceButton } from "@/components/dashboard/demo-workspace-button";
import { NewQuestionnaireCard } from "@/components/questionnaires/new-questionnaire-card";
import { QuestionnaireList } from "@/components/questionnaires/questionnaire-list";
import { requireOrgContext } from "@/lib/auth/session";
import { FREE_QUESTIONNAIRES_PER_MONTH, FREE_QUESTIONS_PER_QUESTIONNAIRE } from "@/lib/services/plan-limits";
import { listQuestionnaires } from "@/lib/services/questionnaires";

export const metadata: Metadata = { title: "Questionnaires" };

/** The demo workspace button seeds six documents from this page too. */
export const maxDuration = 120;

export default async function QuestionnairesPage() {
  const { org } = await requireOrgContext();
  const items = await listQuestionnaires(org.id, { limit: 200 });
  const freeNote =
    org.plan === "free"
      ? `Free plan: ${FREE_QUESTIONNAIRES_PER_MONTH} questionnaire a month, up to ${FREE_QUESTIONS_PER_QUESTIONNAIRE} questions. The demo questionnaire does not count.`
      : null;

  return (
    <>
      <PageHeader
        title="Questionnaires"
        description="Customer security questionnaires: map the columns, let the agent draft from your policies, review each answer, then export into the original workbook."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 min-w-0 lg:order-1">
          {items.length === 0 ? (
            <EmptyState
              title="No questionnaires yet"
              description="Upload the customer's spreadsheet to start, or load the synthetic demo workspace with a 40-question questionnaire."
              action={<DemoWorkspaceButton variant="outline" />}
            />
          ) : (
            <QuestionnaireList items={items} timeZone={org.timezone} />
          )}
        </div>
        <div className="order-1 lg:sticky lg:top-6 lg:order-2">
          <NewQuestionnaireCard freeNote={freeNote} />
        </div>
      </div>
    </>
  );
}
