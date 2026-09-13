import type { CSSProperties, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Soft pulse bone — Topology chip token, respects reduced motion via CSS. */
export function Bone({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={cx(
        "animate-pulse rounded-md bg-[color:var(--topo-chip)] motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function PageHeaderSkeleton({
  descriptionLines = 2,
  badgeCount = 2,
  actionCount = 1,
}: {
  descriptionLines?: number;
  badgeCount?: number;
  actionCount?: number;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[color:var(--topo-line)] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <Bone className="h-2.5 w-16" />
        <Bone className="h-7 w-44 sm:h-8 sm:w-56" />
        <div className="max-w-2xl space-y-1.5 pt-0.5">
          {Array.from({ length: descriptionLines }).map((_, i) => (
            <Bone
              key={i}
              className={cx(
                "h-3.5",
                i === descriptionLines - 1 ? "w-[80%] max-w-md" : "w-full max-w-xl",
              )}
            />
          ))}
        </div>
        {badgeCount > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {Array.from({ length: badgeCount }).map((_, i) => (
              <Bone key={i} className="h-5 w-16 rounded" />
            ))}
          </div>
        ) : null}
      </div>
      {actionCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: actionCount }).map((_, i) => (
            <Bone key={i} className="h-8 w-24" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FilterBarSkeleton({
  filters = 1,
}: {
  filters?: number;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Bone className="h-9 w-full sm:max-w-sm sm:flex-1" />
      {Array.from({ length: filters }).map((_, i) => (
        <Bone key={i} className="h-9 w-full sm:w-44" />
      ))}
    </div>
  );
}

export function ReportListRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Bone className="h-4 w-48 max-w-[60%]" />
          <Bone className="h-5 w-20 rounded" />
          <Bone className="h-5 w-14 rounded" />
        </div>
        <Bone className="h-3 w-56 max-w-full" />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <Bone className="h-4 w-10" />
        <Bone className="h-5 w-9 rounded" />
        <Bone className="h-5 w-9 rounded" />
      </div>
    </div>
  );
}

export function SimpleListRowSkeleton({
  withStatus = true,
}: {
  withStatus?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Bone className="h-4 w-40 max-w-[70%]" />
        <Bone className="h-3 w-28 max-w-[50%]" />
      </div>
      {withStatus ? <Bone className="h-5 w-20 shrink-0 rounded" /> : null}
    </div>
  );
}

export function CaseTableRowSkeleton() {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-[color:var(--topo-line)] px-3 py-2.5 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_5rem_5rem_6rem]">
      <Bone className="h-4 w-4 rounded-sm" />
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Bone className="h-3.5 w-14" />
          <Bone className="h-3.5 w-40 max-w-[70%]" />
        </div>
        <Bone className="h-3 w-24 sm:hidden" />
      </div>
      <Bone className="hidden h-5 w-10 rounded sm:block" />
      <Bone className="hidden h-5 w-14 rounded sm:block" />
      <Bone className="h-5 w-16 rounded justify-self-end" />
    </div>
  );
}

/** Mirrors HubShell chrome so route `loading.tsx` doesn’t collapse the sidebar. */
export function ShellLoadingFrame({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className="topology-shell flex min-h-[100dvh] bg-[color:var(--topo-paper)]"
      aria-busy="true"
      aria-label={label}
    >
      <aside className="sticky top-0 z-30 hidden h-[100dvh] w-56 shrink-0 lg:block xl:w-60">
        <div className="flex h-full flex-col gap-3 px-3 py-4">
          <div className="flex items-center gap-2 px-1">
            <Bone className="h-7 w-7 rounded-md" />
            <Bone className="h-4 w-24" />
          </div>
          <div className="mt-2 space-y-1.5 px-0.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Bone key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
          <div className="mt-auto space-y-2 px-0.5">
            <Bone className="h-8 w-full rounded-md" />
            <Bone className="h-3 w-28" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 p-2 pl-1 sm:p-2.5 sm:pl-1.5 lg:p-3 lg:pl-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[color:var(--topo-line)] px-2.5 sm:px-3 lg:hidden">
            <Bone className="h-8 w-8 shrink-0" />
            <Bone className="h-3 w-20" />
            <div className="ml-auto">
              <Bone className="h-7 w-12 rounded-full" />
            </div>
          </header>
          <header className="hidden h-12 shrink-0 items-center gap-3 border-b border-[color:var(--topo-line)] px-2.5 sm:px-3 lg:flex">
            <Bone className="h-8 w-8 shrink-0" />
            <Bone className="h-3 w-24" />
            <Bone className="h-3 w-16" />
            <div className="ml-auto">
              <Bone className="h-8 w-8 shrink-0" />
            </div>
          </header>

          <main className="w-full max-w-none flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function ReportsPageSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton descriptionLines={2} badgeCount={2} actionCount={1} />
      <FilterBarSkeleton filters={1} />
      <ul className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] divide-y divide-[color:var(--topo-line)]">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <ReportListRowSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportDetailSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton descriptionLines={1} badgeCount={4} actionCount={2} />
      <Bone className="h-3 w-72 max-w-full" />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-line)] sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 bg-[color:var(--topo-panel)] px-3 py-3">
            <Bone className="h-2.5 w-14" />
            <Bone className="h-7 w-12" />
            <Bone className="h-2.5 w-20" />
          </div>
        ))}
      </section>

      <section className="grid gap-px overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-line)] lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
            <Bone className="h-2.5 w-28" />
            <Bone className="mt-4 h-40 w-full rounded-md" />
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--topo-line)] px-3 py-2.5">
          <div className="space-y-1.5">
            <Bone className="h-4 w-20" />
            <Bone className="h-3 w-48 max-w-full" />
          </div>
          <Bone className="h-5 w-14 rounded" />
        </div>
        <div className="divide-y divide-[color:var(--topo-line)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_4rem_5rem]"
            >
              <Bone className="h-4 w-40 max-w-full" />
              <Bone className="hidden h-4 w-28 sm:block" />
              <Bone className="hidden h-4 w-8 sm:block" />
              <Bone className="h-4 w-16 justify-self-end" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function CasesPageSkeleton() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton descriptionLines={1} badgeCount={1} actionCount={3} />
      <div className="flex flex-wrap items-end gap-2">
        <Bone className="h-9 min-w-[14rem] flex-1 sm:max-w-xs" />
        <Bone className="h-9 w-[8.5rem]" />
        <Bone className="h-9 w-[8rem]" />
      </div>
      <Bone className="h-8 w-full max-w-md" />
      <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        <div className="hidden border-b border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/30 px-3 py-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_5rem_5rem_6rem] sm:gap-3">
          <Bone className="h-3 w-3" />
          <Bone className="h-3 w-16" />
          <Bone className="h-3 w-10" />
          <Bone className="h-3 w-12" />
          <Bone className="h-3 w-14 justify-self-end" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <CaseTableRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function RunsPageSkeleton() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton descriptionLines={1} badgeCount={1} actionCount={0} />
      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <div className="flex items-center justify-between gap-2">
          <Bone className="h-4 w-28" />
          <Bone className="h-3 w-32 hidden sm:block" />
          <Bone className="h-4 w-4 shrink-0" />
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        <div className="space-y-2 border-b border-[color:var(--topo-line)] p-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Bone className="h-9 min-w-0 flex-1" />
            <Bone className="h-9 w-full sm:w-36" />
          </div>
        </div>
        <ul className="divide-y divide-[color:var(--topo-line)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <SimpleListRowSkeleton />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function HubPageSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton descriptionLines={2} badgeCount={2} actionCount={3} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="min-h-[280px] space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4 sm:col-span-2 lg:col-span-3 lg:row-span-2">
          <div className="flex justify-between gap-3">
            <div className="space-y-2">
              <Bone className="h-2.5 w-24" />
              <Bone className="h-8 w-28" />
              <Bone className="h-3 w-40" />
            </div>
            <div className="space-y-2 text-right">
              <Bone className="ml-auto h-2.5 w-16" />
              <Bone className="ml-auto h-8 w-16" />
            </div>
          </div>
          <Bone className="h-36 w-full" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[132px] space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
          >
            <Bone className="h-2.5 w-20" />
            <Bone className="h-7 w-16" />
            <Bone className="h-3 w-28" />
          </div>
        ))}
        <div className="min-h-[200px] space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4 sm:col-span-2 lg:col-span-3">
          <Bone className="h-2.5 w-24" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Bone className="h-4 w-36 max-w-[60%]" />
              <Bone className="h-5 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AutomationPageSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton descriptionLines={2} badgeCount={1} actionCount={0} />
      <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <Bone className="h-4 w-28" />
        <Bone className="h-24 w-full" />
        <Bone className="h-3 w-40" />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Bone className="h-4 w-36" />
          <Bone className="h-3 w-20" />
        </div>
        <ul className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] divide-y divide-[color:var(--topo-line)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <div className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <Bone className="h-4 w-44 max-w-[70%]" />
                  <Bone className="h-3 w-52 max-w-full" />
                </div>
                <Bone className="h-5 w-20 rounded" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function MilestonesPageSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton descriptionLines={2} badgeCount={1} actionCount={0} />
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Bone className="h-2.5 w-24" />
          <Bone className="h-9 w-full" />
        </div>
        <Bone className="h-8 w-20" />
      </div>
      <ul className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Bone className="h-5 w-40" />
                  <Bone className="h-5 w-16 rounded" />
                  <Bone className="h-5 w-14 rounded" />
                </div>
                <Bone className="h-3 w-64 max-w-full" />
                <div className="space-y-1.5 pt-1">
                  <Bone className="h-3 w-52 max-w-full" />
                  <Bone className="h-3 w-44 max-w-full" />
                </div>
              </div>
              <div className="space-y-2 text-right">
                <Bone className="ml-auto h-9 w-14" />
                <Bone className="ml-auto h-3 w-16" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton descriptionLines={1} badgeCount={1} actionCount={0} />
      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] p-1">
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-9 w-24 shrink-0 rounded-[5px]" />
          ))}
        </div>
      </div>
      <section className="space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
        <div className="space-y-1.5">
          <Bone className="h-4 w-20" />
          <Bone className="h-3 w-56 max-w-full" />
        </div>
        <div className="space-y-1.5">
          <Bone className="h-3 w-12" />
          <Bone className="h-10 w-full" />
        </div>
        <div className="space-y-1.5">
          <Bone className="h-3 w-12" />
          <Bone className="h-10 w-full" />
        </div>
        <Bone className="h-8 w-28" />
      </section>
    </div>
  );
}

export function TriagePageSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton descriptionLines={2} badgeCount={2} actionCount={0} />
      <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <Bone className="h-5 w-10 rounded" />
                  <Bone className="h-5 w-16 rounded" />
                  <Bone className="h-5 w-16 rounded" />
                </div>
                <Bone className="h-4 w-56 max-w-full" />
                <Bone className="h-3 w-72 max-w-full" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Bone className="h-8 w-20" />
                <Bone className="h-8 w-20" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RunDetailSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton descriptionLines={1} badgeCount={2} actionCount={2} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-[color:var(--topo-line)] px-3 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bone className="h-4 w-48 max-w-[70%]" />
                <Bone className="h-3 w-24" />
              </div>
              <div className="flex gap-1.5">
                <Bone className="h-7 w-8" />
                <Bone className="h-7 w-8" />
                <Bone className="h-7 w-8" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
          <Bone className="h-4 w-24" />
          <Bone className="h-24 w-full" />
          <Bone className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}
