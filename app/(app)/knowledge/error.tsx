"use client";

import { RouteError } from "@/components/dashboard/route-error";

export default function KnowledgeError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} title="The knowledge base didn't load" />;
}
