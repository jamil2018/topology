"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { HistoryRunPreview } from "@/lib/import/history";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

type ImportResponse = {
  digest: string;
  provider: "testrail" | "qase";
  namespace: string;
  runs: HistoryRunPreview[];
  invalid: { index: number; sourceId: string | null; reason: string; results: number; attachments: number }[];
};

const labels: Record<HistoryRunPreview["state"], string> = {
  ready: "Ready to import", imported: "Imported", unchanged: "Already imported",
  conflict: "Conflicting snapshot", failed: "Retry available",
};

export function HistoryImportPanel({ projectId, canApply }: { projectId: string; canApply: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportResponse | null>(null);
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState("");
  const lock = useRef(false);

  async function submit(mode: "preview" | "apply") {
    if (!file || lock.current) return;
    lock.current = true;
    setPending(mode);
    setError("");
    const params = new URLSearchParams({ mode });
    if (mode === "apply" && report) params.set("digest", report.digest);
    try {
      const response = await fetch(`/api/import/history?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-topology-project-id": projectId },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not read this bundle");
      setReport(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not import this bundle");
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  const eligible = report?.runs.filter((run) => run.state === "ready" || run.state === "failed").length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Import run history" description="Preview completed TestRail or Qase runs before importing their results and attachments."
        actions={<Link href="/cases/import" className="button button--sm button--secondary">Import cases</Link>} />
      <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <div className="space-y-1">
          <label htmlFor="history-bundle" className="block text-sm font-medium">History bundle</label>
          <input id="history-bundle" type="file" accept=".json,application/json" disabled={Boolean(pending)}
            aria-describedby="history-bundle-hint"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError("");
              setReport(null);
            }} />
          <p id="history-bundle-hint" className="text-xs text-[color:var(--topo-muted)]">JSON file up to 8 MiB. Use the same source namespace as the case import.</p>
        </div>
        {error ? <p role="alert" className="topo-feedback">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onPress={() => void submit("preview")} isDisabled={!file || Boolean(pending)}>
            {pending === "preview" ? "Previewing…" : "Preview bundle"}
          </Button>
          {canApply ? (
            <Button size="sm" variant="primary" onPress={() => void submit("apply")} isDisabled={eligible === 0 || Boolean(pending)}>
              {pending === "apply" ? "Importing…" : `Import ${eligible} ${eligible === 1 ? "run" : "runs"}`}
            </Button>
          ) : null}
        </div>
      </div>
      {report ? (
        <section aria-label="History import results" className="space-y-2">
          <p role="status" className="text-sm">
            {report.provider === "testrail" ? "TestRail" : "Qase"} · {report.runs.length} parsed · {report.invalid.length} skipped
          </p>
          <ul className="divide-y divide-[color:var(--topo-line)] rounded-md border border-[color:var(--topo-line)]">
            {report.runs.map((run) => (
              <li key={run.sourceId} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {run.href ? <Link href={run.href} className="font-medium underline">{run.name}</Link> : <span className="font-medium">{run.name}</span>}
                  <StatusChip>{labels[run.state]}</StatusChip>
                </div>
                <p className="text-xs text-[color:var(--topo-muted)]">{run.sourceId} · {run.resultCount} results · {run.attachmentCount} attachments</p>
                {run.reason ? <p className="text-sm">{run.reason}</p> : null}
                {run.unmapped.length || run.ambiguous.length ? (
                  <details className="text-sm">
                    <summary>{run.unmapped.length} unmapped · {run.ambiguous.length} ambiguous source cases</summary>
                    {run.unmapped.length ? <p className="break-words">Unmapped · {run.unmapped.join(", ")}</p> : null}
                    {run.ambiguous.length ? <p className="break-words">Ambiguous · {run.ambiguous.join(", ")}</p> : null}
                  </details>
                ) : null}
              </li>
            ))}
            {report.invalid.map((run) => (
              <li key={run.index} className="space-y-1 p-3">
                <p className="font-medium">Skipped source run {run.sourceId ?? `at position ${run.index + 1}`}</p>
                <p className="text-sm">{run.reason}</p>
                <p className="text-xs text-[color:var(--topo-muted)]">{run.results} results · {run.attachments} attachments</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
