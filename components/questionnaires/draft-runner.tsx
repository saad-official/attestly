"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { DraftBatchResult } from "@/lib/services/questionnaires";

type Problem =
  | { kind: "limit"; message: string; upgradeUrl: string }
  | { kind: "ai"; message: string }
  | { kind: "auth" }
  | { kind: "error"; message: string };

type DraftProgress = { drafted: number; total: number; needsEvidence: number; failed: number };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function messageOf(body: unknown, fallback: string): string {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" && error ? error : fallback;
}

/**
 * Drives drafting (spec 3.3) while the questionnaire is in "drafting": POSTs
 * /api/questionnaires/[id]/draft in a loop (15 questions a request) and
 * refreshes the page as each batch lands. Another tab or a double mount
 * running the same batch gets `busy: true`; this waits and asks again.
 * Stops on a plan limit (402), a missing AI provider (503) or an error.
 */
export function DraftRunner({
  questionnaireId,
  total,
  drafted,
  needsEvidence,
}: {
  questionnaireId: string;
  total: number;
  drafted: number;
  needsEvidence: number;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [runId, setRunId] = useState(0);
  const [progress, setProgress] = useState<DraftProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (paused || problem) return;
    let cancelled = false;

    async function run() {
      // Let a mount that is immediately undone (React Strict Mode) skip its request.
      await sleep(50);
      let networkFailures = 0;
      while (!cancelled) {
        let response: Response;
        try {
          response = await fetch(`/api/questionnaires/${questionnaireId}/draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            cache: "no-store",
          });
        } catch {
          if (cancelled) return;
          networkFailures += 1;
          if (networkFailures >= 3) {
            setProblem({ kind: "error", message: "Lost the connection to Attestly while drafting." });
            return;
          }
          await sleep(2000 * networkFailures);
          continue;
        }
        networkFailures = 0;
        const body: unknown = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.status === 401) {
          setProblem({ kind: "auth" });
          return;
        }
        if (response.status === 402) {
          const upgradeUrl = (body as { upgradeUrl?: unknown } | null)?.upgradeUrl;
          setProblem({
            kind: "limit",
            message: messageOf(body, "Your plan's limit stops drafting here."),
            upgradeUrl: typeof upgradeUrl === "string" ? upgradeUrl : "/billing",
          });
          return;
        }
        if (response.status === 503 && (body as { code?: unknown } | null)?.code === "ai_unavailable") {
          setProblem({ kind: "ai", message: messageOf(body, "No AI provider is configured.") });
          return;
        }
        if (response.status === 409) {
          // Mapping not confirmed (or the state moved on): let the page decide.
          router.refresh();
          return;
        }
        if (!response.ok || !body) {
          setProblem({ kind: "error", message: messageOf(body, `Drafting stopped (HTTP ${response.status}).`) });
          return;
        }

        const result = body as DraftBatchResult;
        setProgress((previous) => ({
          drafted: result.counts.total - result.counts.pending,
          total: result.counts.total,
          needsEvidence: result.counts.needs_evidence,
          failed: (previous?.failed ?? 0) + result.failed,
        }));
        setBusy(result.busy);
        if (result.processed > 0) router.refresh();

        if (result.remaining === 0 || result.status !== "drafting") {
          toast.success("Drafting complete. Every question has a draft or a needs-evidence note.");
          router.refresh();
          return;
        }
        if (result.busy) await sleep(4000);
      }
    }

    void run();
    // The in-flight batch is not aborted: the server finishes it either way,
    // and the result is simply ignored once this effect is cleaned up.
    return () => {
      cancelled = true;
    };
  }, [questionnaireId, paused, problem, runId, router]);

  const shown: DraftProgress = progress ?? { drafted, total, needsEvidence, failed: 0 };
  const done = Math.max(shown.drafted, drafted);
  const percent = shown.total === 0 ? 0 : Math.round((done / shown.total) * 100);
  const running = !paused && !problem;

  return (
    <section
      aria-label="Drafting progress"
      className="rounded-xl border border-evergreen/30 bg-moss-light/40 p-4 dark:bg-moss-light/20"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {running ? <Loader2 className="size-4 animate-spin text-evergreen" aria-hidden /> : <Sparkles className="size-4 text-evergreen" aria-hidden />}
            <span role="status" aria-live="polite">
              <span className="tabular font-mono">{done}</span> of <span className="tabular font-mono">{shown.total}</span> drafted
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {problem
              ? "Drafting stopped."
              : paused
                ? "Paused. Questions already drafted can be reviewed now."
                : busy
                  ? "Another tab is drafting this questionnaire; waiting for it."
                  : "Retrieving passages and drafting the next questions. You can review drafted rows while this runs."}
            {shown.needsEvidence > 0 ? ` ${shown.needsEvidence} need evidence so far.` : ""}
            {shown.failed > 0 ? ` ${shown.failed} failed to draft (marked needs evidence).` : ""}
          </p>
        </div>
        {problem ? null : (
          <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            {paused ? "Resume" : "Pause"}
          </Button>
        )}
      </div>
      <Progress value={percent} className="mt-3 h-1.5 bg-card" aria-label="Questions drafted" />

      {problem ? (
        <div
          role="alert"
          className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-card px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between"
        >
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <span>
              {problem.kind === "limit" ? (
                <>
                  {problem.message}{" "}
                  <Link href={problem.upgradeUrl} className="font-medium text-evergreen underline underline-offset-3">
                    See plans
                  </Link>
                </>
              ) : problem.kind === "ai" ? (
                <>
                  <span className="font-medium">AI drafting is not configured on this deployment.</span> {problem.message} Add a Groq or
                  Google AI key to the environment, then resume.
                </>
              ) : problem.kind === "auth" ? (
                <>
                  Your session expired.{" "}
                  <Link href="/sign-in?expired=1" className="font-medium text-evergreen underline underline-offset-3">
                    Sign in again
                  </Link>{" "}
                  to keep drafting.
                </>
              ) : (
                problem.message
              )}
            </span>
          </p>
          {problem.kind === "error" || problem.kind === "ai" ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                setProblem(null);
                setRunId((n) => n + 1);
              }}
            >
              <RotateCcw aria-hidden />
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
