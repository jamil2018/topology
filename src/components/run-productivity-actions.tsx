"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { abortCleanup, isAbortError } from "@/lib/abort";
import { useProjectActions } from "./project-actions";
import type { RunDetail } from "./run-executor-model";
import { InlineRowsSkeleton } from "./skeletons";
import { TopoCheckbox } from "./ui/topo-checkbox";
import { TopoDisclosure } from "./ui/topo-disclosure";

type Lineage = {
  sourceId: string;
  sourceRunId: string;
  sourceName: string;
  sourceStatus: string;
  resultId: string;
  runId: string;
  name: string;
  status: string;
};

export function RunProductivityActions({ run }: { run: RunDetail }) {
  const saveLock = useRef(false);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const unavailableCases = run.results.filter((result) => result.caseId === null);
  const { can } = useProjectActions();
  const failures = run.results.filter((result) =>
    ["failed", "blocked"].includes(result.status),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(`${run.name} template`);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lineage, setLineage] = useState<Lineage[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setHistoryError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/runs/${run.id}/retests`, {
          signal: controller.signal,
        });
        if (cancelled || controller.signal.aborted) return;
        if (!response.ok) throw new Error("Retest history unavailable");
        const data = await response.json();
        if (cancelled || controller.signal.aborted) return;
        setLineage(data.lineage ?? []);
      } catch (error) {
        if (cancelled || controller.signal.aborted || isAbortError(error)) return;
        setHistoryError("Retest history could not be loaded.");
        setExpanded(true);
      } finally {
        if (!cancelled && !controller.signal.aborted) setLoading(false);
      }
    })().catch((error) => {
      if (cancelled || controller.signal.aborted || isAbortError(error)) return;
    });
    return () => {
      cancelled = true;
      abortCleanup(controller);
    };
  }, [run.id, retry]);

  async function save() {
    if (saveLock.current || unavailableCases.length || !can("runs.create")) return;
    saveLock.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/run-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: run.description,
          caseIds: [...new Set(run.results.map((result) => result.case.id))],
          environment: run.environment ?? "local",
          assigneeId: run.assigneeId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save template");
      setMessage("Template saved under Test runs.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save template");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const failureSummary = failures.length
    ? ` · ${failures.length} failures or blockers`
    : "";

  return (
    <TopoDisclosure
      bordered
      isExpanded={expanded}
      onExpandedChange={setExpanded}
      title={`Reuse this run · Retest history${failureSummary}`}
      bodyClassName="mt-3 space-y-3"
    >
      {can("runs.create") ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-[color:var(--topo-muted)]">
              Save as template
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <TextField className="min-w-[12rem] flex-1" name="template-name">
                <Label className="text-xs text-[color:var(--topo-muted)]">
                  Template name
                </Label>
                <Input
                  aria-label="Template name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </TextField>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={
                  saving ||
                  unavailableCases.length > 0 ||
                  !name.trim() ||
                  !run.results.length
                }
                onPress={() => void save()}
              >
                Save as template
              </Button>
            </div>
            {unavailableCases.length ? (
              <p className="text-sm text-[color:var(--topo-muted)]">
                {unavailableCases.length} results have no executable case. Create a
                reviewed retest and link those failures before saving a reusable
                selection.
              </p>
            ) : null}
          </div>

          {failures.length ? (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[color:var(--topo-muted)]">
                Select failures to retest
              </legend>
              {failures.map((result) => (
                <TopoCheckbox
                  key={result.id}
                  compact
                  isSelected={selected.includes(result.id)}
                  onChange={(checked) =>
                    setSelected((ids) =>
                      checked
                        ? [...ids, result.id]
                        : ids.filter((id) => id !== result.id),
                    )
                  }
                >
                  {result.case.key} · {result.case.title}
                </TopoCheckbox>
              ))}
              {selected.length ? (
                <Link
                  className="inline-block rounded-md bg-[color:var(--topo-accent)] px-3 py-2 text-sm text-[color:var(--accent-foreground)]"
                  href={`/runs/new?retest=${selected
                    .filter((id) => failures.some((failure) => failure.id === id))
                    .join(",")}`}
                >
                  Review retest · {selected.length}
                </Link>
              ) : null}
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}

      <div className="border-t border-[color:var(--topo-line)] pt-3">
        <p className="text-xs font-medium text-[color:var(--topo-muted)]">
          Retest lineage
        </p>
        {loading ? (
          <div role="status" aria-busy="true" aria-label="Loading retest history">
            <InlineRowsSkeleton rows={3} dense />
          </div>
        ) : historyError ? (
          <p role="alert" className="mt-2 text-sm">
            {historyError}{" "}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="underline"
              onPress={() => setRetry((value) => value + 1)}
            >
              Retry
            </Button>
          </p>
        ) : lineage.length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {lineage.map((item) => (
              <li key={`${item.sourceId}:${item.resultId}`}>
                <Link
                  className="underline"
                  href={`/runs/${item.sourceRunId}?result=${item.sourceId}`}
                >
                  {item.sourceName} · {item.sourceStatus}
                </Link>
                <span> → </span>
                <Link
                  className="underline"
                  href={`/runs/${item.runId}?result=${item.resultId}`}
                >
                  {item.name} · {item.status}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[color:var(--topo-muted)]">
            No retests linked to this run.
          </p>
        )}
      </div>
    </TopoDisclosure>
  );
}
