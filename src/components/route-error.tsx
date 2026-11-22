"use client";

import Link from "next/link";
import { Button } from "@heroui/react";

export function RouteError({
  title,
  description,
  retry,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  retry: () => void;
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
        <Button type="button" size="sm" variant="primary" onPress={retry}>
          Try again
        </Button>
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
