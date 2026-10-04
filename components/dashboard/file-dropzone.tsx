"use client";

import { useId, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "./format";

/**
 * Drag-and-drop or click-to-choose file field. Validation is the caller's
 * (`validate` returns an error message or null); the chosen file is lifted
 * through `onFile`.
 */
export function FileDropzone({
  accept,
  file,
  onFile,
  validate,
  disabled = false,
  hint,
  onInvalid,
  className,
}: {
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
  validate?: (file: File) => string | null;
  disabled?: boolean;
  hint?: React.ReactNode;
  onInvalid?: (message: string) => void;
  className?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function choose(next: File | null | undefined) {
    if (!next) return;
    const problem = validate?.(next) ?? null;
    if (problem) {
      onInvalid?.(problem);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onFile(next);
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) choose(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        dragging ? "border-evergreen bg-accent" : "hover:bg-muted/50",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <FileUp className="size-5 text-muted-foreground" aria-hidden />
      {file ? (
        <span className="max-w-full truncate">
          <span className="font-mono text-[0.8125rem]">{file.name}</span>{" "}
          <span className="text-muted-foreground">· {formatBytes(file.size)}</span>
        </span>
      ) : (
        <span>
          <span className="font-medium text-evergreen">Choose a file</span>{" "}
          <span className="text-muted-foreground">or drop it here</span>
        </span>
      )}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        name="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => choose(e.target.files?.[0])}
      />
    </label>
  );
}
