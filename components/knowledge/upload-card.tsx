"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FileDropzone } from "@/components/dashboard/file-dropzone";
import { FormMessage } from "@/components/dashboard/form-message";
import { uploadWithProgress } from "@/components/dashboard/upload-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { DocumentSummary } from "@/lib/db/types";
import { MAX_UPLOAD_BYTES } from "@/lib/services/plan-limits";

const ACCEPT =
  ".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain";

function checkFile(file: File): string | null {
  if (!/\.(pdf|docx|md|markdown|txt)$/i.test(file.name)) return "Upload a PDF, DOCX, Markdown or TXT file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "Documents must be 10 MB or smaller.";
  return null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "indexing" }
  | { kind: "done"; document: Omit<DocumentSummary, "text"> }
  | { kind: "failed"; message: string; upgradeUrl?: string };

/**
 * Policy upload (spec 3.1): drag-and-drop, then POST /api/documents with
 * upload progress. The route extracts, chunks and embeds before answering,
 * so after the bytes are sent the card shows "Indexing".
 */
export function UploadCard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "indexing";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "policy");
    if (title.trim()) form.set("title", title.trim());
    setPhase({ kind: "uploading", progress: 0 });
    const result = await uploadWithProgress<{ document: DocumentSummary }>("/api/documents", form, {
      onProgress: (progress) => setPhase((p) => (p.kind === "uploading" ? { kind: "uploading", progress } : p)),
      onUploaded: () => setPhase({ kind: "indexing" }),
    });
    if (!result.ok) {
      setPhase({ kind: "failed", message: result.error, upgradeUrl: result.upgradeUrl });
      return;
    }
    const doc = result.data.document;
    router.refresh();
    if (doc.status === "failed") {
      setPhase({ kind: "failed", message: doc.error ?? "The document could not be read." });
      return;
    }
    setPhase({ kind: "done", document: doc });
    setFile(null);
    setTitle("");
    toast.success(`${doc.title} indexed.`);
  }

  return (
    <section aria-labelledby="upload-title" className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10">
      <h2 id="upload-title" className="text-base">
        Upload a policy
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">PDF, DOCX, Markdown or TXT, up to 10 MB. Headings are kept for citations.</p>
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
        <div className="grid gap-1.5">
          <Label htmlFor="upload-title-input" className="text-xs text-muted-foreground">
            Title (optional)
          </Label>
          <Input
            id="upload-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Defaults to the file name"
            maxLength={200}
            disabled={busy}
          />
        </div>

        {phase.kind === "uploading" || phase.kind === "indexing" ? (
          <div className="grid gap-1.5" role="status" aria-live="polite">
            <Progress value={phase.kind === "uploading" ? Math.round(phase.progress * 90) : 95} className="h-1.5" />
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {phase.kind === "uploading"
                ? `Uploading… ${Math.round(phase.progress * 100)}%`
                : "Extracting text, chunking by heading and embedding…"}
            </p>
          </div>
        ) : null}

        {phase.kind === "done" ? (
          <p role="status" className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-approved" aria-hidden />
            <span>
              <Link href={`/knowledge/${phase.document.id}`} className="font-medium underline-offset-3 hover:underline">
                {phase.document.title}
              </Link>{" "}
              indexed into {phase.document.chunkCount} {phase.document.chunkCount === 1 ? "chunk" : "chunks"}.
              {phase.document.error ? <span className="mt-0.5 block text-xs text-muted-foreground">{phase.document.error}</span> : null}
            </span>
          </p>
        ) : null}
        {phase.kind === "failed" ? <FormMessage error={phase.message} upgradeUrl={phase.upgradeUrl} /> : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={!file || busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
            {phase.kind === "uploading" ? "Uploading" : phase.kind === "indexing" ? "Indexing" : "Upload and index"}
          </Button>
        </div>
      </form>
    </section>
  );
}
