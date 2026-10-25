"use client";

import Link from "next/link";

export function RouteError({
  title,
  description,
  reset,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  reset: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-md border border-[color:var(--topo-danger-border)] bg-[color-mix(in_srgb,var(--topo-danger)_10%,transparent)] p-4"
    >
      <h2 className="text-sm font-semibold text-[color:var(--topo-danger)]">
        {title}
      </h2>
      <p className="text-xs text-[color:var(--topo-muted)]">{description}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)]"
        >
          Try again
        </button>
        {backHref ? (
          <Link
            href={backHref}
            className="rounded-md border border-[color:var(--topo-line)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)]"
          >
            {backLabel ?? "Back"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
