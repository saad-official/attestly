"use client";

import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { bulkApproveAction } from "@/app/(app)/questionnaires/actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const THRESHOLDS = [0.95, 0.9, 0.85, 0.8, 0.7];

/**
 * Bulk approve (spec 3.4): every drafted answer at or above the confidence
 * threshold. `confidences` are the drafted rows' scores, so the button can
 * say how many it will approve.
 */
export function BulkApprove({ questionnaireId, confidences }: { questionnaireId: string; confidences: number[] }) {
  const [threshold, setThreshold] = useState(0.85);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const eligible = confidences.filter((c) => c >= threshold).length;

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await bulkApproveAction(questionnaireId, threshold);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(result.message ?? "Approved.");
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={String(threshold)} onValueChange={(v) => setThreshold(Number(v))}>
        <SelectTrigger size="sm" className="w-[5.5rem] font-mono text-xs" aria-label="Confidence threshold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THRESHOLDS.map((t) => (
            <SelectItem key={t} value={String(t)} className="font-mono text-xs">
              ≥ {t.toFixed(2)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={eligible === 0 || pending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <CheckCheck aria-hidden />
        Approve {eligible}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Approve ${eligible} drafted ${eligible === 1 ? "answer" : "answers"}?`}
        description={`Every drafted answer with confidence ${threshold.toFixed(2)} or higher is approved as written and added to the answer library. You can reopen any of them later.`}
        confirmLabel={`Approve ${eligible}`}
        pendingLabel="Approving"
        pending={pending}
        error={error}
        onConfirm={approve}
      />
    </div>
  );
}
