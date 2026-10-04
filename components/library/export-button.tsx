"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Download, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { exportLibraryAction } from "@/app/(app)/library/actions";
import { Button } from "@/components/ui/button";

/**
 * Library CSV export (Pro). No export route exists, so the Server Action
 * returns the CSV and the browser saves it from a Blob URL.
 */
export function ExportLibraryButton({ allowed, disabled = false }: { allowed: boolean; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();

  if (!allowed) {
    return (
      <Button asChild variant="outline" title="Answer library export is a Pro feature">
        <Link href="/billing">
          <Lock aria-hidden />
          Export CSV · Pro
        </Link>
      </Button>
    );
  }

  function exportCsv() {
    startTransition(async () => {
      const result = await exportLibraryAction();
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "The export was empty." : result.error);
        return;
      }
      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  return (
    <Button variant="outline" onClick={exportCsv} disabled={pending || disabled}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      Export CSV
    </Button>
  );
}
