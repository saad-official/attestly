"use client";

import { RouteError } from "@/components/dashboard/route-error";

export default function ReviewError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="This questionnaire didn't load"
      backHref="/questionnaires"
      backLabel="All questionnaires"
    />
  );
}
