import { cn } from "cn";
import { container } from "./site";
import { SectionLabel } from "./section-label";

/**
 * Shared shell for Privacy and Terms: a narrow reading column beside a short
 * note column on wide screens. Styles child prose without a typography plugin.
 */
export function LegalPage({
  label,
  title,
  updated,
  children,
}: {
  label: string;
  title: string;
  /** ISO date, shown as-is in mono. */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(container, "grid gap-10 py-14 md:grid-cols-12 md:py-20")}>
      <header className="md:col-span-4">
        <SectionLabel>{label}</SectionLabel>
        <h1 className="mt-4 text-4xl leading-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated{" "}
          <time dateTime={updated} className="tabular font-mono">
            {updated}
          </time>
        </p>
        <p className="mt-8 border-l-2 border-amber pl-3 text-sm leading-relaxed font-medium">
          Attestly is a portfolio demo. This page is not legal advice.
        </p>
      </header>
      <div
        className={cn(
          "max-w-2xl min-w-0 text-[0.9375rem] leading-relaxed text-foreground/85 md:col-span-7 md:col-start-6",
          "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:text-foreground [&>h2:first-child]:mt-0",
          "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:marker:text-muted-foreground",
          "[&_strong]:font-semibold [&_strong]:text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}
