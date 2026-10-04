"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared body for the signed-in screens' error boundaries (Next 16 passes `retry`). */
export function RouteError({
  error,
  retry,
  title,
  backHref = "/dashboard",
  backLabel = "Go to dashboard",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-14 text-center"
    >
      <h2 className="font-heading text-xl">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Something went wrong while loading this page. Your documents and answers are safe; try again in a moment.
        {error.digest ? <span className="mt-1 block font-mono text-xs">Reference {error.digest}</span> : null}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </section>
  );
}
