import { AppShell } from "@/components/app-shell";

/**
 * Loading placeholders. Each route's loading.tsx renders the real app
 * shell plus the page's rough layout, so a tap shows the page frame
 * instantly instead of nothing while the server works (slow hospital
 * networks). Purely decorative: aria-busy on the wrapper, one status line
 * for screen readers.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-[var(--rule-paper)]/70 ${className}`} />;
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <AppShell user={{ fullName: "" }}>
      <div aria-busy="true" className="flex flex-col gap-5">
        <p className="sr-only" role="status">
          Loading {label}…
        </p>
        {children}
      </div>
    </AppShell>
  );
}

function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded border border-[var(--rule-paper)] bg-[var(--paper-2)] p-4">
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lists and boards: title, a filter row, then rows. */
export function ListPageSkeleton({ label }: { label: string }) {
  return (
    <Frame label={label}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-11 w-28" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-11 w-24" />
      </div>
      <CardSkeleton rows={6} />
    </Frame>
  );
}

/** Home: greeting, quick-start chips, sections. */
export function HomeSkeleton() {
  return (
    <Frame label="Home">
      <div className="flex items-end justify-between gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-11 w-40" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-12 w-48" />
      </div>
      <Skeleton className="h-5 w-36" />
      <CardSkeleton rows={3} />
      <Skeleton className="h-5 w-28" />
      <div className="flex gap-2.5">
        <Skeleton className="h-28 w-64" />
        <Skeleton className="h-28 w-64" />
      </div>
    </Frame>
  );
}

/** An inspection: sticky step bar, then the checklist. */
export function InspectionSkeleton() {
  return (
    <Frame label="the inspection">
      <div className="flex flex-col gap-2 border-b border-[var(--rule-paper)] pb-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-2 w-full" />
        <div className="flex gap-4">
          {["w-12", "w-14", "w-28", "w-16", "w-14"].map((w, i) => (
            <Skeleton key={i} className={`h-8 ${w}`} />
          ))}
        </div>
      </div>
      <CardSkeleton rows={5} />
    </Frame>
  );
}

/** Forms: a few labelled fields. */
export function FormSkeleton({ label }: { label: string }) {
  return (
    <Frame label={label}>
      <Skeleton className="h-7 w-52" />
      <div className="flex flex-col gap-4 rounded border border-[var(--rule-paper)] bg-[var(--paper-2)] p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
        <Skeleton className="h-11 w-40" />
      </div>
    </Frame>
  );
}
