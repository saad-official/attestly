import { cn } from "cn";

/**
 * Section labels are numbered like clauses in a policy document ("§ 3"),
 * the same vocabulary the product uses for citation breadcrumbs.
 */
export function SectionLabel({
  clause,
  children,
  className,
}: {
  clause?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("flex items-baseline gap-2.5 font-mono text-xs text-muted-foreground", className)}>
      {clause ? (
        <span className="tabular font-medium text-evergreen">
          <span aria-hidden="true">§ </span>
          <span className="sr-only">Section </span>
          {clause}
        </span>
      ) : null}
      <span className="tracking-[0.04em] uppercase">{children}</span>
    </p>
  );
}
