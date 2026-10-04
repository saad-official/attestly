"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { FileDropzone } from "@/components/dashboard/file-dropzone";
import { FormMessage } from "@/components/dashboard/form-message";
import { uploadWithProgress } from "@/components/dashboard/upload-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { MAX_UPLOAD_BYTES } from "@/lib/services/plan-limits";
import type { MappingPreview } from "@/lib/services/questionnaires";

const ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

function checkFile(file: File): string | null {
  if (/\.xls$/i.test(file.name)) return "Legacy .xls files are not supported. Save the workbook as .xlsx or CSV.";
  if (!/\.(xlsx|csv)$/i.test(file.name)) return "Upload the questionnaire as XLSX or CSV.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "Questionnaires must be 10 MB or smaller.";
  return null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "reading" }
  | { kind: "opening" }
  | { kind: "failed"; message: string; upgradeUrl?: string };

/**
 * New questionnaire (spec 3.2): the customer's XLSX or CSV goes to
 * POST /api/questionnaires, which stores it and detects the columns; then
 * the mapping preview opens.
 */
export function NewQuestionnaireCard({ freeNote }: { freeNote?: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "reading" || phase.kind === "opening";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const form = new FormData();
    form.set("file", file);
    if (name.trim()) form.set("name", name.trim());
    if (customer.trim()) form.set("customer", customer.trim());
    setPhase({ kind: "uploading", progress: 0 });
    const result = await uploadWithProgress<MappingPreview>("/api/questionnaires", form, {
      onProgress: (progress) => setPhase((p) => (p.kind === "uploading" ? { kind: "uploading", progress } : p)),
      onUploaded: () => setPhase({ kind: "reading" }),
    });
    if (!result.ok) {
      setPhase({ kind: "failed", message: result.error, upgradeUrl: result.upgradeUrl });
      return;
    }
    setPhase({ kind: "opening" });
    router.push(`/questionnaires/${result.data.questionnaire.id}/mapping`);
  }

  return (
    <section
      id="new"
      aria-labelledby="new-questionnaire-title"
      className="scroll-mt-20 rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10"
    >
      <h2 id="new-questionnaire-title" className="text-base">
        New questionnaire
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        The customer&rsquo;s spreadsheet as XLSX or CSV, up to 10 MB. You confirm the columns before drafting starts.
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-3">
        <FileDropzone
          accept={ACCEPT}
          file={file}
          onFile={(next) => {
            setFile(next);
            setPhase({ kind: "idle" });
            if (next && !name) setName(next.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim());
          }}
          validate={checkFile}
          onInvalid={(message) => setPhase({ kind: "failed", message })}
          disabled={busy}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="grid gap-1.5">
            <Label htmlFor="questionnaire-name" className="text-xs text-muted-foreground">
              Name
            </Label>
            <Input
              id="questionnaire-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to the file name"
              maxLength={200}
              disabled={busy}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="questionnaire-customer" className="text-xs text-muted-foreground">
              Customer (optional)
            </Label>
            <Input
              id="questionnaire-customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="e.g. Acme Corp"
              maxLength={200}
              disabled={busy}
            />
          </div>
        </div>
        {busy ? (
          <div className="grid gap-1.5" role="status" aria-live="polite">
            <Progress value={phase.kind === "uploading" ? Math.round(phase.progress * 80) : phase.kind === "reading" ? 90 : 100} className="h-1.5" />
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {phase.kind === "uploading"
                ? `Uploading… ${Math.round(phase.progress * 100)}%`
                : phase.kind === "reading"
                  ? "Finding the question and answer columns…"
                  : "Opening the column mapping…"}
            </p>
          </div>
        ) : null}
        {phase.kind === "failed" ? <FormMessage error={phase.message} upgradeUrl={phase.upgradeUrl} /> : null}
        {freeNote ? <p className="text-xs text-muted-foreground">{freeNote}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={!file || busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileSpreadsheet aria-hidden />}
            {busy ? "Working" : "Upload and map columns"}
          </Button>
        </div>
      </form>
    </section>
  );
}
