import { Skeleton } from "@/components/ui/skeleton";

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-36" />
      </div>
    </div>
  );
}

/** Loading state for the dense list screens (questionnaires, knowledge base, library). */
export function ListSkeleton({ label, rows = 8, withCard = false }: { label: string; rows?: number; withCard?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}</span>
      <HeaderSkeleton />
      {withCard ? <Skeleton className="h-36 rounded-xl" /> : null}
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t px-4 py-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Loading state for the dashboard: tiles, then two lists. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading dashboard</span>
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

/** Loading state for a detail screen (review grid, mapping, document). */
export function DetailSkeleton({ label, rows = 10 }: { label: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-28" />
      <HeaderSkeleton />
      <Skeleton className="h-10 w-full max-w-2xl" />
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <Skeleton className="h-9 rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid grid-cols-[6rem_minmax(0,1fr)_6rem] items-start gap-4 border-t px-4 py-3">
            <Skeleton className="h-4 w-20" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
