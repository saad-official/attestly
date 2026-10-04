"use client";

import { Fragment, useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Loader2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { reviewQuestionAction, type ReviewActionInput } from "@/app/(app)/questionnaires/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AnswerText } from "./answer-text";
import { Confidence } from "./confidence";
import { SourcePassage } from "./source-passage";
import { QuestionStatusChip } from "./status-chip";
import { citationTarget, type GridRow, type SourcesById } from "./types";

type ReviewKind = ReviewActionInput["action"];

const INLINE_SOURCE_QUERY = "(min-width: 1024px)";
const MAX_ANSWER_CHARS = 8000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button, a, input, textarea, select, label, [role='button']"));
}

function available(row: GridRow) {
  return {
    approve: Boolean(row.answer?.trim()) && row.status !== "approved",
    edit: true,
    notApplicable: row.status !== "not_applicable",
    needsEvidence: row.status !== "needs_evidence",
    reopen:
      row.status === "approved" || row.status === "not_applicable" || (row.status === "needs_evidence" && row.draft !== null),
  };
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-[3px] border border-border bg-background px-1 font-mono text-[0.625rem] leading-none text-foreground">
      {children}
    </kbd>
  );
}

const th =
  "sticky top-0 z-10 border-b bg-card px-3 py-2 text-left font-mono text-[0.625rem] font-medium tracking-[0.06em] text-muted-foreground uppercase";
const cell = "border-b px-3 py-2.5 align-top @max-4xl:border-0 @max-4xl:p-0";

/**
 * The review grid (spec 3.4). Dense table with a sticky header that turns
 * into stacked rows in a narrow container. A row expands to the full answer
 * with citation markers, the notes and the reviewer actions; the selected
 * citation's passage shows in a column beside it from lg up, or in a sheet
 * below lg. Keyboard: J/K move, Enter expands, A approves, E edits, Esc
 * closes. `readOnly` (the public share page) drops every action.
 */
export function ReviewGrid({
  rows,
  sources,
  readOnly = false,
  drafting = false,
  emptyMessage = "No questions in this view.",
}: {
  rows: GridRow[];
  sources: SourcesById;
  readOnly?: boolean;
  drafting?: boolean;
  emptyMessage?: string;
}) {
  const [selection, setSelection] = useState<{ id: string; index: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: string; text: string } | null>(null);
  const [active, setActive] = useState<{ rowId: string; index: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, setPending] = useState<{ rowId: string; action: ReviewKind } | null>(null);
  const [, startTransition] = useTransition();

  // A selected row can leave the view after a review (status filter): keep the position.
  const selectedIndex = useMemo(() => {
    if (!selection || rows.length === 0) return -1;
    const byId = rows.findIndex((r) => r.id === selection.id);
    return byId >= 0 ? byId : Math.min(selection.index, rows.length - 1);
  }, [selection, rows]);
  const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : null;

  const sheetRow = active ? rows.find((r) => r.id === active.rowId) ?? null : null;

  function focusRow(id: string) {
    const el = document.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }
  }

  function select(index: number, options: { expand?: boolean; focus?: boolean } = {}) {
    const row = rows[index];
    if (!row) return;
    setSelection({ id: row.id, index });
    if (options.expand) setExpandedId(row.id);
    if (options.focus !== false) requestAnimationFrame(() => focusRow(row.id));
  }

  function toggleExpand(row: GridRow, index: number) {
    setSelection({ id: row.id, index });
    setExpandedId((current) => (current === row.id ? null : row.id));
  }

  function openCitation(row: GridRow, index: number, citationIndex: number) {
    setSelection({ id: row.id, index });
    setExpandedId(row.id);
    setActive({ rowId: row.id, index: citationIndex });
    if (!window.matchMedia(INLINE_SOURCE_QUERY).matches) setSheetOpen(true);
  }

  function startEdit(row: GridRow, index: number) {
    if (readOnly) return;
    setSelection({ id: row.id, index });
    setExpandedId(row.id);
    setNoteFor(null);
    setEditing({ id: row.id, text: row.answer ?? "" });
    requestAnimationFrame(() => document.getElementById(`edit-${row.id}`)?.focus());
  }

  function review(row: GridRow, input: ReviewActionInput, options: { advance?: boolean } = {}) {
    if (readOnly || pending) return;
    const index = rows.findIndex((r) => r.id === row.id);
    setPending({ rowId: row.id, action: input.action });
    startTransition(async () => {
      const result = await reviewQuestionAction(row.id, input);
      setPending(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (editing?.id === row.id) setEditing(null);
      if (noteFor?.id === row.id) setNoteFor(null);
      if (options.advance && index >= 0 && index + 1 < rows.length) {
        const next = rows[index + 1];
        setSelection({ id: next.id, index: index + 1 });
        if (expandedId === row.id) setExpandedId(next.id);
        requestAnimationFrame(() => focusRow(next.id));
      }
    });
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (editing) setEditing(null);
      else if (noteFor) setNoteFor(null);
      else if (expandedId) setExpandedId(null);
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"], [role="listbox"]')) return;
    if (rows.length === 0) return;

    if (key === "j" || key === "k") {
      event.preventDefault();
      const next =
        selectedIndex === -1 ? 0 : key === "j" ? Math.min(selectedIndex + 1, rows.length - 1) : Math.max(selectedIndex - 1, 0);
      // While a row is open, the next one opens too (reading mode).
      select(next, { expand: expandedId !== null });
      return;
    }
    if (!selectedRow || readOnly) return;
    if (key === "a") {
      if (!available(selectedRow).approve) return;
      event.preventDefault();
      review(selectedRow, { action: "approve" }, { advance: true });
    } else if (key === "e") {
      event.preventDefault();
      startEdit(selectedRow, selectedIndex);
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="@container min-w-0">
      <div className="rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[0.8125rem] leading-snug @max-4xl:block">
          <caption className="sr-only">
            Questions and answers. Select a row and press Enter to open it{readOnly ? "" : "; A approves, E edits"}.
          </caption>
          <colgroup>
            <col className="w-32" />
            <col className="w-[27%]" />
            <col />
            <col className="w-34" />
            <col className="w-24" />
            <col className={readOnly ? "w-12" : "w-20"} />
          </colgroup>
          <thead className="@max-4xl:hidden">
            <tr>
              <th scope="col" className={cn(th, "rounded-tl-xl")}>
                Section
              </th>
              <th scope="col" className={th}>
                Question
              </th>
              <th scope="col" className={th}>
                {readOnly ? "Answer" : "Draft / final"}
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={th}>
                Confidence
              </th>
              <th scope="col" className={cn(th, "rounded-tr-xl")}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="@max-4xl:block">
            {rows.map((row, index) => {
              const selected = selectedRow?.id === row.id;
              const expanded = expandedId === row.id;
              const can = available(row);
              const rowPending = pending?.rowId === row.id ? pending.action : null;
              const activeIndex = active?.rowId === row.id ? active.index : null;
              return (
                <Fragment key={row.id}>
                  <tr
                    data-row-id={row.id}
                    tabIndex={0}
                    aria-current={selected ? "true" : undefined}
                    aria-expanded={expanded}
                    onClick={(event) => {
                      if (isInteractive(event.target)) return;
                      toggleExpand(row, index);
                    }}
                    onFocus={(event) => {
                      if (event.target === event.currentTarget && !selected) setSelection({ id: row.id, index });
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpand(row, index);
                      }
                    }}
                    className={cn(
                      "group cursor-pointer outline-none transition-colors hover:bg-muted/30 focus-visible:bg-moss-light/30",
                      "@max-4xl:grid @max-4xl:grid-cols-[minmax(0,1fr)_auto] @max-4xl:gap-x-3 @max-4xl:gap-y-2 @max-4xl:border-b @max-4xl:px-3.5 @max-4xl:py-3",
                      selected && "bg-moss-light/30 @max-4xl:shadow-[inset_3px_0_0_var(--evergreen)]",
                      row.status === "needs_evidence" && !selected && "bg-amber/[0.06]",
                      expanded && "@max-4xl:border-b-0",
                    )}
                  >
                    <td
                      className={cn(
                        cell,
                        "@max-4xl:col-start-1 @max-4xl:row-start-1 @max-4xl:self-center",
                        selected && "shadow-[inset_3px_0_0_var(--evergreen)] @max-4xl:shadow-none",
                        expanded && "border-b-0",
                      )}
                    >
                      <span className="block truncate font-mono text-[0.6875rem] text-muted-foreground @max-4xl:inline">
                        {row.externalId ?? `Row ${row.rowNumber}`}
                      </span>
                      {row.section ? (
                        <span className="mt-0.5 line-clamp-2 block text-[0.75rem] text-foreground/75 @max-4xl:mt-0 @max-4xl:ml-2 @max-4xl:inline">
                          {row.section}
                        </span>
                      ) : null}
                    </td>
                    <th
                      scope="row"
                      className={cn(cell, "text-left font-medium @max-4xl:col-span-2 @max-4xl:row-start-2", expanded && "border-b-0")}
                    >
                      <span className={cn(!expanded && "line-clamp-4")}>{row.text}</span>
                    </th>
                    <td
                      className={cn(
                        cell,
                        "text-foreground/90 @max-4xl:col-span-2 @max-4xl:row-start-3",
                        expanded && "border-b-0 @max-4xl:hidden",
                      )}
                    >
                      {expanded ? (
                        <span className="text-xs text-muted-foreground">
                          <span aria-hidden="true">↓ </span>Shown below
                        </span>
                      ) : row.answer ? (
                        <AnswerText
                          text={row.answer}
                          citations={row.citations}
                          clamp
                          activeIndex={activeIndex}
                          onCite={(i) => openCitation(row, index, i)}
                        />
                      ) : row.status === "pending" ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground italic">
                          {drafting ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                          {drafting ? "Waiting for the agent…" : "Not drafted yet."}
                        </span>
                      ) : (
                        <>
                          <span className="text-muted-foreground italic">No draft.</span>
                          {row.notes ? (
                            <span className="mt-1 line-clamp-2 border-l-2 border-amber pl-2 text-[0.75rem] leading-snug text-amber-foreground dark:text-amber">
                              {row.notes}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td
                      className={cn(cell, "@max-4xl:col-start-2 @max-4xl:row-start-1 @max-4xl:self-center", expanded && "border-b-0")}
                    >
                      <QuestionStatusChip status={row.status} className="text-[0.72rem]" />
                      {row.edited ? (
                        <span className="mt-1 block font-mono text-[0.625rem] tracking-wide text-muted-foreground uppercase @max-4xl:hidden">
                          Edited
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(cell, "@max-4xl:col-start-1 @max-4xl:row-start-4 @max-4xl:self-center", expanded && "border-b-0")}>
                      <Confidence value={row.confidence} />
                    </td>
                    <td
                      className={cn(
                        cell,
                        "text-right @max-4xl:col-start-2 @max-4xl:row-start-4 @max-4xl:self-center",
                        expanded && "border-b-0",
                      )}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {!readOnly && can.approve ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-approved hover:bg-approved/10 hover:text-approved"
                            onClick={() => review(row, { action: "approve" })}
                            disabled={Boolean(pending)}
                            aria-label={`Approve answer to: ${row.text.slice(0, 80)}`}
                            title="Approve (A)"
                          >
                            {rowPending === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => toggleExpand(row, index)}
                          aria-label={expanded ? "Close details" : "Open details"}
                          aria-expanded={expanded}
                        >
                          <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} aria-hidden />
                        </Button>
                      </span>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="@max-4xl:block">
                      <td colSpan={6} className="border-b bg-parchment/60 px-3 pt-1 pb-4 @max-4xl:block @max-4xl:px-3.5 dark:bg-background/40">
                        <RowDetail
                          row={row}
                          sources={sources}
                          readOnly={readOnly}
                          activeIndex={activeIndex ?? (row.citations.length > 0 ? 0 : null)}
                          onCite={(i) => openCitation(row, index, i)}
                          editing={editing?.id === row.id ? editing.text : null}
                          onEditChange={(text) => setEditing({ id: row.id, text })}
                          onStartEdit={() => startEdit(row, index)}
                          onCancelEdit={() => setEditing(null)}
                          note={noteFor?.id === row.id ? noteFor.text : null}
                          onNoteChange={(text) => setNoteFor({ id: row.id, text })}
                          onStartNote={() => {
                            setEditing(null);
                            setNoteFor({ id: row.id, text: row.notes ?? "" });
                            requestAnimationFrame(() => document.getElementById(`note-${row.id}`)?.focus());
                          }}
                          onCancelNote={() => setNoteFor(null)}
                          pendingAction={rowPending}
                          busy={Boolean(pending)}
                          onReview={(input, options) => review(row, input, options)}
                          can={can}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <div className="hidden flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-b-xl border-t bg-parchment px-4 py-2 font-mono text-[0.6875rem] text-muted-foreground md:flex dark:bg-background/40">
          <p>
            {rows.length} {rows.length === 1 ? "question" : "questions"}
            {selectedRow ? ` · row ${selectedIndex + 1} selected` : ""}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> move
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>↵</Kbd> open
            </span>
            {readOnly ? null : (
              <>
                <span className="inline-flex items-center gap-1">
                  <Kbd>A</Kbd> approve
                </span>
                <span className="inline-flex items-center gap-1">
                  <Kbd>E</Kbd> edit
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="pr-12">
            <SheetTitle>Source passage</SheetTitle>
            <SheetDescription className="line-clamp-3">{sheetRow?.text ?? ""}</SheetDescription>
          </SheetHeader>
          {sheetRow && active && sheetRow.citations[active.index] ? (
            <div className="space-y-4 px-4 pb-6">
              <SourcePassage
                citation={sheetRow.citations[active.index]}
                source={sources[citationTarget(sheetRow.citations[active.index]) ?? ""]}
                index={active.index + 1}
              />
              {sheetRow.citations.length > 1 ? (
                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={active.index === 0}
                    onClick={() => setActive({ rowId: sheetRow.id, index: active.index - 1 })}
                  >
                    <ChevronLeft aria-hidden /> Previous
                  </Button>
                  <span className="tabular font-mono text-xs text-muted-foreground">
                    {active.index + 1} of {sheetRow.citations.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={active.index >= sheetRow.citations.length - 1}
                    onClick={() => setActive({ rowId: sheetRow.id, index: active.index + 1 })}
                  >
                    Next <ChevronRight aria-hidden />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RowDetail({
  row,
  sources,
  readOnly,
  activeIndex,
  onCite,
  editing,
  onEditChange,
  onStartEdit,
  onCancelEdit,
  note,
  onNoteChange,
  onStartNote,
  onCancelNote,
  pendingAction,
  busy,
  onReview,
  can,
}: {
  row: GridRow;
  sources: SourcesById;
  readOnly: boolean;
  activeIndex: number | null;
  onCite: (index: number) => void;
  editing: string | null;
  onEditChange: (text: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  note: string | null;
  onNoteChange: (text: string) => void;
  onStartNote: () => void;
  onCancelNote: () => void;
  pendingAction: ReviewKind | null;
  busy: boolean;
  onReview: (input: ReviewActionInput, options?: { advance?: boolean }) => void;
  can: ReturnType<typeof available>;
}) {
  const activeCitation = activeIndex !== null ? row.citations[activeIndex] : undefined;
  const spinner = (action: ReviewKind) => (pendingAction === action ? <Loader2 className="animate-spin" aria-hidden /> : null);

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,21rem)]">
      <div className="min-w-0 space-y-4">
        {editing !== null ? (
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onReview({ action: "edit", final: editing });
            }}
          >
            <Label htmlFor={`edit-${row.id}`} className="font-mono text-[0.65rem] tracking-[0.06em] text-muted-foreground uppercase">
              Final answer
            </Label>
            <Textarea
              id={`edit-${row.id}`}
              value={editing}
              onChange={(e) => onEditChange(e.target.value)}
              rows={6}
              maxLength={MAX_ANSWER_CHARS}
              className="bg-card text-[0.8125rem] leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Saving approves the answer and adds it to the library. Keep only what the citations support.{" "}
              <span className="hidden md:inline">Ctrl+Enter saves, Esc cancels.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy || !editing.trim()}>
                {spinner("edit") ?? <Check aria-hidden />}
                Save and approve
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onCancelEdit} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <p className="flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.06em] text-muted-foreground uppercase">
              {row.status === "approved" || row.status === "not_applicable" ? "Final answer" : readOnly ? "Answer" : "Draft"}
              {row.edited ? <span className="rounded-sm border px-1 normal-case tracking-normal">edited by reviewer</span> : null}
            </p>
            {row.answer ? (
              <AnswerText
                text={row.answer}
                citations={row.citations}
                activeIndex={activeIndex}
                onCite={onCite}
                className="mt-1 text-[0.875rem] leading-relaxed text-foreground"
              />
            ) : (
              <p className="mt-1 text-sm text-muted-foreground italic">
                {row.status === "pending" ? "Not drafted yet." : "No answer. Nothing in the knowledge base supports one."}
              </p>
            )}
            {row.edited && row.draft && !readOnly ? (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Agent&rsquo;s original draft</summary>
                <p className="mt-1 border-l-2 pl-2 whitespace-pre-line text-foreground/75">{row.draft}</p>
              </details>
            ) : null}
          </div>
        )}

        {row.notes ? (
          <div
            className={cn(
              "border-l-2 pl-2.5 text-[0.8125rem] leading-snug",
              row.status === "needs_evidence" ? "border-amber text-amber-foreground dark:text-amber" : "border-border text-foreground/80",
            )}
          >
            <span className="font-mono text-[0.625rem] tracking-[0.06em] uppercase">
              {row.status === "needs_evidence" ? "Needs evidence " : "Note "}
            </span>
            {row.notes}
          </div>
        ) : null}

        {row.citations.length > 0 ? (
          <div>
            <p className="font-mono text-[0.65rem] tracking-[0.06em] text-muted-foreground uppercase">Citations</p>
            <ol className="mt-1.5 grid gap-1.5">
              {row.citations.map((c, i) => {
                const source = sources[citationTarget(c) ?? ""];
                return (
                  <li key={`${i}-${citationTarget(c) ?? ""}`}>
                    <button
                      type="button"
                      onClick={() => onCite(i)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                        activeIndex === i && "border-evergreen/50 bg-moss-light/40",
                      )}
                    >
                      <span className="cite mt-0.5 ml-0 shrink-0 align-baseline">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[0.8125rem] font-medium">
                          {source ? source.title : "Source removed"}
                          {source && source.kind === "chunk" && source.headingPath.length > 0 ? (
                            <span className="font-normal text-muted-foreground"> › {source.headingPath[source.headingPath.length - 1]}</span>
                          ) : null}
                        </span>
                        {c.quote ? <span className="line-clamp-2 text-xs text-muted-foreground italic">“{c.quote}”</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : row.status !== "pending" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileQuestion className="size-3.5" aria-hidden />
            No citations. Every answer cites its source or says it has none.
          </p>
        ) : null}

        {!readOnly && note !== null ? (
          <form
            className="grid gap-2 rounded-lg border border-amber/50 bg-amber/5 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              onReview({ action: "needs_evidence", notes: note });
            }}
          >
            <Label htmlFor={`note-${row.id}`} className="text-xs">
              What evidence is missing?
            </Label>
            <Input
              id={`note-${row.id}`}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              maxLength={2000}
              placeholder="e.g. Needs a cyber insurance certificate with coverage limits"
              className="bg-card"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" variant="secondary" disabled={busy}>
                {spinner("needs_evidence") ?? <FileQuestion aria-hidden />}
                Mark needs evidence
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onCancelNote} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {!readOnly && editing === null && note === null ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {can.approve ? (
              <Button size="sm" onClick={() => onReview({ action: "approve" }, { advance: true })} disabled={busy}>
                {spinner("approve") ?? <Check aria-hidden />}
                Approve
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onStartEdit} disabled={busy}>
              <Pencil aria-hidden />
              {row.answer ? "Edit" : "Write answer"}
            </Button>
            {can.notApplicable ? (
              <Button size="sm" variant="outline" onClick={() => onReview({ action: "not_applicable" })} disabled={busy}>
                {spinner("not_applicable") ?? <Ban aria-hidden />}
                Not applicable
              </Button>
            ) : null}
            {can.needsEvidence ? (
              <Button size="sm" variant="outline" onClick={onStartNote} disabled={busy}>
                <FileQuestion aria-hidden />
                Needs evidence
              </Button>
            ) : null}
            {can.reopen ? (
              <Button size="sm" variant="ghost" onClick={() => onReview({ action: "reopen" })} disabled={busy}>
                {spinner("reopen") ?? <RotateCcw aria-hidden />}
                Reopen
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside aria-label="Source passage" className="hidden min-w-0 rounded-lg border bg-card p-3 lg:block">
        {activeCitation && activeIndex !== null ? (
          <SourcePassage citation={activeCitation} source={sources[citationTarget(activeCitation) ?? ""]} index={activeIndex + 1} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {row.citations.length === 0
              ? "This answer has no citations, so there is no passage to show."
              : "Select a citation marker to see the passage it quotes."}
          </p>
        )}
      </aside>
    </div>
  );
}
