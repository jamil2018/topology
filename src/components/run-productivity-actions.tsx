"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { useProjectActions } from "./project-actions";
import type { RunDetail } from "./run-executor-model";

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: string }).name === "AbortError";
}

type Lineage = { sourceId: string; sourceRunId: string; sourceName: string; sourceStatus: string; resultId: string; runId: string; name: string; status: string };
export function RunProductivityActions({ run }: { run: RunDetail }) {
  const saveLock = useRef(false);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const unavailableCases = run.results.filter((result) => result.caseId === null);
  const { can } = useProjectActions();
  const failures = run.results.filter((result) => ["failed", "blocked"].includes(result.status));
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(`${run.name} template`);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lineage, setLineage] = useState<Lineage[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true); setHistoryError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/runs/${run.id}/retests`, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        if (!response.ok) throw new Error("Retest history unavailable");
        const data = await response.json();
        if (cancelled || controller.signal.aborted) return;
        setLineage(data.lineage ?? []);
      } catch (error) {
        if (cancelled || controller.signal.aborted || isAbortError(error)) return;
        setHistoryError("Retest history could not be loaded.");
      } finally {
        if (!cancelled && !controller.signal.aborted) setLoading(false);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [run.id, retry]);
  async function save() {
    if (saveLock.current || unavailableCases.length || !can("runs.create")) return;
    saveLock.current = true;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/run-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: run.description, caseIds: [...new Set(run.results.map((result) => result.case.id))], environment: run.environment ?? "local", assigneeId: run.assigneeId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save template");
      setMessage("Template saved under Test runs.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save template"); }
    finally { saveLock.current = false; setSaving(false); }
  }
  return <details className="rounded-lg border border-[color:var(--topo-line)] p-3">
    <summary className="cursor-pointer text-sm font-medium text-[color:var(--topo-ink)]">Reuse this run · Retest history{failures.length ? ` · ${failures.length} failures or blockers` : ""}</summary>
    {can("runs.create") ? <div className="mt-3 space-y-3">
      <div className="topo-toolbar"><label>Template name <input value={name} onChange={(event) => setName(event.target.value)} /></label><Button size="sm" variant="secondary" isDisabled={saving || unavailableCases.length > 0 || !name.trim() || !run.results.length} onPress={() => void save()}>Save as template</Button></div>
      {unavailableCases.length ? <p className="text-sm">{unavailableCases.length} results have no executable case. Create a reviewed retest and link those failures before saving a reusable selection.</p> : null}
      {failures.length ? <fieldset className="space-y-2"><legend className="text-sm">Select failures to retest</legend>{failures.map((result) => <label key={result.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(result.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, result.id] : ids.filter((id) => id !== result.id))} />{result.case.key} · {result.case.title}</label>)}{selected.length ? <Link className="inline-block rounded-md bg-[color:var(--topo-accent)] px-3 py-2 text-sm text-[color:var(--accent-foreground)]" href={`/runs/new?retest=${selected.filter((id) => failures.some((failure) => failure.id === id)).join(",")}`}>Review retest · {selected.length}</Link> : null}</fieldset> : null}
    </div> : null}
    {message ? <p role="status" className="mt-2 text-sm">{message}</p> : null}
    {loading ? <p role="status" className="mt-2 text-sm">Loading retest history…</p> : historyError ? <p role="alert" className="mt-2 text-sm">{historyError} <button className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></p> : lineage.length ? <ul className="mt-3 space-y-2 text-sm">{lineage.map((item) => <li key={`${item.sourceId}:${item.resultId}`}><Link className="underline" href={`/runs/${item.sourceRunId}?result=${item.sourceId}`}>{item.sourceName} · {item.sourceStatus}</Link><span> → </span><Link className="underline" href={`/runs/${item.runId}?result=${item.resultId}`}>{item.name} · {item.status}</Link></li>)}</ul> : <p className="mt-2 text-xs text-[color:var(--topo-muted)]">No retests linked to this run.</p>}
  </details>;
}
