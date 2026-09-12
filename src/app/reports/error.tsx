"use client";

import Link from "next/link";

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-md border border-red-500/30 bg-red-500/10 p-4"
    >
      <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">
        Reports failed to load
      </h2>
      <p className="text-xs text-[color:var(--topo-muted)]">
        {error.message || "Unexpected error while loading run reports."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[color:var(--topo-ink)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-panel)]"
        >
          Try again
        </button>
        <Link
          href="/runs"
          className="rounded-md border border-[color:var(--topo-line)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)]"
        >
          Back to runs
        </Link>
      </div>
    </div>
  );
}
