"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FileDropzone } from "@/components/dashboard/file-dropzone";
import { columnLetter, formatNumber } from "@/components/dashboard/format";
import { FormMessage } from "@/components/dashboard/form-message";
import { uploadWithProgress } from "@/components/dashboard/upload-request";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ImportLibraryResult } from "@/lib/services/library";
import { MAX_UPLOAD_BYTES } from "@/lib/services/plan-limits";

const ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

function checkFile(file: File): string | null {
  if (/\.xls$/i.test(file.name)) return "Legacy .xls files are not supported. Save the workbook as .xlsx or CSV.";
  if (!/\.(xlsx|csv)$/i.test(file.name)) return "Upload an XLSX or CSV file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "Workbooks must be 10 MB or smaller.";
  return null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "importing" }
  | { kind: "done"; result: ImportLibraryResult }
  | { kind: "failed"; message: string; upgradeUrl?: string };

/** Imports a past questionnaire (question and answer columns) into the library via POST /api/library/import. */
export function ImportCard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "importing";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const form = new FormData();
    form.set("file", file);
    setPhase({ kind: "uploading", progress: 0 });
    const result = await uploadWithProgress<ImportLibraryResult>("/api/library/import", form, {
      onProgress: (progress) => setPhase((p) => (p.kind === "uploading" ? { kind: "uploading", progress } : p)),
      onUploaded: () => setPhase({ kind: "importing" }),
    });
    if (!result.ok) {
      setPhase({ kind: "failed", message: result.error, upgradeUrl: result.upgradeUrl });
      return;
    }
    setPhase({ kind: "done", result: result.data });
    setFile(null);
    router.refresh();
    toast.success(`${formatNumber(result.data.imported)} answers imported.`);
  }

  return (
    <section aria-labelledby="import-title" className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10">
      <h2 id="import-title" className="text-base">
        Import a past questionnaire
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        XLSX or CSV with a question and an answer column, up to 10 MB. Columns are detected automatically; rows without an
        answer and pairs already in the library are skipped.
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-3">
        <FileDropzone
          accept={ACCEPT}
          file={file}
          onFile={(next) => {
            setFile(next);
            setPhase({ kind: "idle" });
          }}
          validate={checkFile}
          onInvalid={(message) => setPhase({ kind: "failed", message })}
          disabled={busy}
        />
        {busy ? (
          <div className="grid gap-1.5" role="status" aria-live="polite">
            <Progress value={phase.kind === "uploading" ? Math.round(phase.progress * 90) : 95} className="h-1.5" />
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {phase.kind === "uploading" ? `Uploading… ${Math.round(phase.progress * 100)}%` : "Reading rows and embedding questions…"}
            </p>
          </div>
        ) : null}
        {phase.kind === "done" ? (
          <div role="status" className="grid gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4 text-approved" aria-hidden />
              {formatNumber(phase.result.imported)} {phase.result.imported === 1 ? "answer" : "answers"} imported
            </p>
            <p className="text-xs text-muted-foreground">
              Sheet “{phase.result.mapping.sheetName}”, questions from column {columnLetter(phase.result.mapping.columns.question)}
              {phase.result.mapping.columns.answer ? `, answers from column ${columnLetter(phase.result.mapping.columns.answer)}` : ""}.{" "}
              {phase.result.skippedEmpty > 0 ? `${formatNumber(phase.result.skippedEmpty)} without an answer skipped. ` : ""}
              {phase.result.skippedDuplicates > 0 ? `${formatNumber(phase.result.skippedDuplicates)} duplicates skipped. ` : ""}
              {!phase.result.embedded ? "Semantic search for these answers is pending; the daily job embeds them." : ""}
            </p>
          </div>
        ) : null}
        {phase.kind === "failed" ? <FormMessage error={phase.message} upgradeUrl={phase.upgradeUrl} /> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="outline" disabled={!file || busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileSpreadsheet aria-hidden />}
            {phase.kind === "uploading" ? "Uploading" : phase.kind === "importing" ? "Importing" : "Import answers"}
          </Button>
        </div>
      </form>
    </section>
  );
}
