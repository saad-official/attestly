import Link from "next/link";
import { cn } from "cn";
import { focusRing } from "./site";

/**
 * The mark: a small evergreen square with a check drawn from two borders of a
 * rotated box. Pure CSS, so it needs no icon set and inherits nothing.
 */
export function CheckSquare({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-block size-4 shrink-0 rounded-[3px] bg-evergreen", className)}
    >
      <span className="absolute top-[2px] left-[5.5px] h-[8.5px] w-[4.5px] rotate-45 border-r-2 border-b-2 border-evergreen-foreground" />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 font-heading text-[1.3125rem] leading-none font-semibold tracking-[-0.02em] text-foreground",
        focusRing,
        className,
      )}
    >
      <CheckSquare />
      Attestly
    </Link>
  );
}
