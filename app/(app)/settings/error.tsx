"use client";

import { RouteError } from "@/components/dashboard/route-error";

export default function SettingsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} title="Settings didn't load" />;
}
