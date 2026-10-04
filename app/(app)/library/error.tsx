"use client";

import { RouteError } from "@/components/dashboard/route-error";

export default function LibraryError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} title="The answer library didn't load" />;
}
