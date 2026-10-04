"use client";

import { RouteError } from "@/components/dashboard/route-error";

export default function QuestionnairesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} title="Questionnaires didn't load" />;
}
