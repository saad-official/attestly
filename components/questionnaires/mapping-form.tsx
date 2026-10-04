"use client";

import { useActionState, useMemo, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { confirmMappingAction } from "@/app/(app)/questionnaires/actions";
import { initialFormState } from "@/components/dashboard/action-result";
import { columnLetter } from "@/components/dashboard/format";
import { FormMessage } from "@/components/dashboard/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type MappingState = {
  sheetName: string;
  headerRow: number;
  question: number;
  answer?: number;
  comment?: number;
  id?: number;
};

type Role = "question" | "answer" | "comment" | "id";

const ROLES: Array<{ role: Role; label: string; hint: string; required?: boolean }> = [
  { role: "question", label: "Question column", hint: "The text of each question.", required: true },
  { role: "answer", label: "Answer column", hint: "Approved answers are written here on export." },
  { role: "comment", label: "Comment column", hint: "Notes such as “Needs evidence: …”." },
  { role: "id", label: "ID column", hint: "The customer’s own question id, e.g. AC-03." },
];

const NONE = "none";

/**
 * The column-mapping controls. Changing a select updates the URL
 * (`?h=&q=&a=&c=&i=`), so the server re-reads the workbook with the new
 * mapping and the preview below reflects it. "Confirm" submits the mapping
 * currently shown.
 */
export function MappingForm({
  questionnaireId,
  mapping,
  headers,
  questionCount,
  blocked,
}: {
  questionnaireId: string;
  mapping: MappingState;
  headers: Array<{ column: number; label: string }>;
  questionCount: number;
  /** Set when the shown mapping is not valid (the preview fell back to detection). */
  blocked?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNavigation] = useTransition();
  const [state, formAction, submitting] = useActionState(confirmMappingAction, initialFormState);

  const columnOptions = useMemo(() => {
    const labels = new Map(headers.map((h) => [h.column, h.label]));
    const used = [mapping.question, mapping.answer, mapping.comment, mapping.id].filter((c): c is number => c !== undefined);
    const max = Math.max(6, ...headers.map((h) => h.column), ...used);
    return Array.from({ length: Math.min(max, 60) }, (_, i) => {
      const column = i + 1;
      const label = labels.get(column);
      return { value: String(column), label: label ? `${columnLetter(column)} · ${label}` : `Column ${columnLetter(column)}` };
    });
  }, [headers, mapping]);

  const headerOptions = useMemo(() => {
    const max = Math.max(15, mapping.headerRow + 5);
    return Array.from({ length: max + 1 }, (_, row) => ({
      value: String(row),
      label: row === 0 ? "No header row" : `Row ${row}`,
    }));
  }, [mapping.headerRow]);

  function apply(next: MappingState) {
    const params = new URLSearchParams();
    params.set("h", String(next.headerRow));
    params.set("q", String(next.question));
    if (next.answer !== undefined) params.set("a", String(next.answer));
    if (next.comment !== undefined) params.set("c", String(next.comment));
    if (next.id !== undefined) params.set("i", String(next.id));
    startNavigation(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  function setRole(role: Role, value: string) {
    const column = value === NONE ? undefined : Number(value);
    const next: MappingState = { ...mapping };
    // A column has one role: clear it from any other role first.
    if (column !== undefined) {
      for (const other of ["answer", "comment", "id"] as const) {
        if (other !== role && next[other] === column) next[other] = undefined;
      }
    }
    if (role === "question") {
      if (column === undefined) return;
      next.question = column;
    } else {
      next[role] = column;
    }
    apply(next);
  }

  const busy = navigating || submitting;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="questionnaireId" value={questionnaireId} />
      <input type="hidden" name="sheetName" value={mapping.sheetName} />
      <input type="hidden" name="headerRow" value={mapping.headerRow} />
      <input type="hidden" name="question" value={mapping.question} />
      <input type="hidden" name="answer" value={mapping.answer ?? ""} />
      <input type="hidden" name="comment" value={mapping.comment ?? ""} />
      <input type="hidden" name="id" value={mapping.id ?? ""} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="mapping-header" className="text-xs">
            Header row
          </Label>
          <Select value={String(mapping.headerRow)} onValueChange={(v) => apply({ ...mapping, headerRow: Number(v) })} disabled={busy}>
            <SelectTrigger id="mapping-header" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {headerOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Questions are read from the rows below it.</p>
        </div>
        {ROLES.map(({ role, label, hint, required }) => {
          const current = mapping[role];
          return (
            <div key={role} className="grid gap-1.5">
              <Label htmlFor={`mapping-${role}`} className="text-xs">
                {label}
              </Label>
              <Select value={current === undefined ? NONE : String(current)} onValueChange={(v) => setRole(role, v)} disabled={busy}>
                <SelectTrigger id={`mapping-${role}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {required ? null : <SelectItem value={NONE}>None</SelectItem>}
                  {columnOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          );
        })}
      </div>

      {mapping.answer === undefined ? (
        <p className="rounded-lg border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-amber-foreground dark:text-amber">
          No answer column is selected. Drafting and review still work, but the XLSX export has nowhere to write answers;
          CSV export lists them instead.
        </p>
      ) : null}

      <FormMessage error={state.error} upgradeUrl={state.upgradeUrl} />

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {navigating ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Re-reading the workbook…
            </span>
          ) : (
            <>
              <span className="tabular font-mono text-foreground">{questionCount}</span>{" "}
              {questionCount === 1 ? "question" : "questions"} will be drafted.
            </>
          )}
        </p>
        <Button type="submit" size="lg" disabled={busy || blocked || questionCount === 0}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          {submitting ? "Starting" : "Confirm and start drafting"}
        </Button>
      </div>
    </form>
  );
}
