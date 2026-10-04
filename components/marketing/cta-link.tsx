import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "cn";

type CtaLinkProps = ComponentProps<typeof Link> & {
  tone?: "primary" | "outline";
  size?: "md" | "lg";
};

/**
 * A link styled as a call to action. Every CTA on the site navigates, so it
 * stays an anchor: it works without JavaScript and announces as a link.
 */
export function CtaLink({ tone = "primary", size = "lg", className, ...props }: CtaLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border font-medium whitespace-nowrap outline-none select-none",
        "motion-safe:transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-evergreen",
        size === "lg" ? "h-11 px-5 text-[0.9375rem]" : "h-9 px-3.5 text-sm",
        tone === "primary" &&
          "border-evergreen bg-evergreen text-evergreen-foreground hover:border-[color-mix(in_oklch,var(--evergreen),var(--ink)_30%)] hover:bg-[color-mix(in_oklch,var(--evergreen),var(--ink)_30%)]",
        tone === "outline" && "border-foreground/30 bg-card text-foreground hover:border-foreground",
        className,
      )}
      {...props}
    />
  );
}
