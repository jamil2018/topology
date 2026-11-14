"use client";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import { useState } from "react";
import { Button } from "@heroui/react";

export function ReportExportActions({
  runId,
  shareable = true,
}: {
  runId: string;
  shareable?: boolean;
}) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { can } = useProjectActions();
  const { saving, submit } = useMutationFeedback(setError);

  async function share() {
    if (!can("reports.create")) return;
    return submit(async () => {
    setError(null);
    const res = await fetch(`/api/reports/${runId}/share`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not share");
      return;
    }
    setShareUrl(typeof data.url === "string" ? data.url : data.path);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["csv", "xlsx", "pdf"] as const).map((format) => (
        <a
          key={format}
          href={`/api/reports/${runId}/export?format=${format}`}
          className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium uppercase text-[color:var(--topo-ink)] transition active:scale-[0.98]"
        >
          {format}
        </a>
      ))}
      {shareable ? (
        <Button size="sm" variant="secondary" isDisabled={saving || !can("reports.create")} onPress={() => void share()}>
          Share link
        </Button>
      ) : null}
      {shareUrl ? (
        <input
          readOnly
          aria-label="Shareable report URL"
          value={shareUrl}
          className="min-w-0 flex-1 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
      {error ? (
        <span className="text-xs text-red-600 dark:text-red-300">{error}</span>
      ) : null}
    </div>
  );
}
