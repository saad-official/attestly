"use client";

import { RouteError } from "@/components/dashboard/route-error";

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} title="The dashboard didn't load" backHref="/questionnaires" backLabel="Go to questionnaires" />;
}
