"use client";
import { useProjectActions } from "./project-actions";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input } from "@heroui/react";
import { motion } from "motion/react";
import { clusterTriageBySignature } from "@topology/domain/client";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";
import { useLiveUpdates } from "./use-live-updates";
import type { LiveEvent } from "@/lib/live-event";

type QueueItem = {
  id: string;
  caseKey: string;
  caseTitle: string;
  priority: string;
  runId: string;
  runName: string;
  notes: string;
  occurrenceCount?: number;
  urgency: string;
  reason: string;
  fingerprint?: string;
  rank?: number;
  isFlaky?: boolean;
  flakeHint?: string | null;
  resultId?: string | null;
  caseId?: string | null;
  signatureId?: string | null;
  /** Commit SHA from the failing run, when known (Phase 4 correlation). */
  commitSha?: string | null;
  issueKey?: string | null;
  issueUrl?: string | null;
};

type FlakeHint = {
  caseId: string;
  caseKey: string;
  title: string;
  score: number;
  hint: string;
};

function signatureTitle(item: QueueItem): string {
  const line = item.notes.trim().split("\n")[0]?.trim();
  return line || item.caseTitle;
}

function toClusterItems(queue: QueueItem[]) {
  return clusterTriageBySignature(
    queue.map((item) => ({
      ...item,
      priority: item.priority as "P0" | "P1" | "P2" | "P3",
      urgency: item.urgency as "immediate" | "soon" | "later",
      fingerprint:
        item.fingerprint ??
        `${item.caseKey}::${item.notes.trim().split("\n")[0]?.slice(0, 120) ?? ""}`.toLowerCase(),
      rank: item.rank ?? 0,
      failedAt: null,
    })),
  );
}

export function TriageWorkspace({
  initialQueue,
  flakeHints,
  issueProvider = "mock",
  demoMode = false,
}: {
  initialQueue: QueueItem[];
  flakeHints: FlakeHint[];
  issueProvider?: string;
  demoMode?: boolean;
}) {
  const { can } = useProjectActions();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [queue, setQueue] = useState(initialQueue);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [linkKey, setLinkKey] = useState<Record<string, string>>({});
  const [clusterSummaries, setClusterSummaries] = useState<
    Record<string, string>
  >({});
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const mockProvider = issueProvider === "mock";
  const showDemoIssue = mockProvider && demoMode;
  const showIssueLink = !mockProvider || demoMode;

  const onLive = useCallback(
    async (event: LiveEvent) => {
      if (event.topic !== "triage" && event.workspaceId !== "*") return;
      if (event.entityId && event.status && event.status !== "open") {
        setQueue((prev) => prev.filter((item) => item.id !== event.entityId));
        return;
      }
      try {
        const res = await fetch("/api/triage");
        if (!res.ok) {
          setError("Could not refresh triage queue");
          return;
        }
        const data = (await res.json()) as { queue?: QueueItem[] };
        if (Array.isArray(data.queue)) setQueue(data.queue);
      } catch {
        setError("Could not refresh triage queue");
      }
    },
    [],
  );
  const liveStatus = useLiveUpdates(onLive, { onReconnect: () => onLive({ topic: "triage", workspaceId: "*" } as LiveEvent) });

  const clusters = toClusterItems(queue);
  useEffect(() => {
    const openTarget = () => {
      const id = window.location.hash.replace("#failure-", "");
      const cluster = toClusterItems(queue).find((item) => item.items.some((member) => member.id === id));
      if (cluster) {
        setExpanded((current) => new Set([...current, cluster.signatureId]));
        requestAnimationFrame(() => document.getElementById(`failure-${id}`)?.scrollIntoView({ block: "center" }));
      }
    };
    openTarget(); window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, [queue]);

  function toggleCluster(signatureId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(signatureId)) next.delete(signatureId);
      else next.add(signatureId);
      return next;
    });
  }

  async function summarizeCluster(signatureId: string, members: QueueItem[]) {
    if (summarizingId || members.length === 0) return;
    setSummarizingId(signatureId);
    setError(null);
    try {
      const res = await fetch("/api/ai/draft?heuristic=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: "triage_summary",
          allowHeuristic: true,
          items: members.map((item) => ({
            caseKey: item.caseKey,
            caseTitle: item.caseTitle,
            notes: item.notes,
            priority: item.priority,
            reason: item.reason,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not summarize cluster",
        );
        return;
      }
      const summary =
        typeof data.summary === "string" ? data.summary.trim() : "";
      if (!summary) {
        setError("AI returned an empty summary");
        return;
      }
      setClusterSummaries((current) => ({
        ...current,
        [signatureId]: summary,
      }));
    } catch {
      setError("Could not summarize cluster");
    } finally {
      setSummarizingId(null);
    }
  }

  async function setStatus(id: string, status: "resolved" | "snoozed") {
    if (!can("triage.manage") || busy.current) return;
    busy.current = true; setPending(true);
    try {
    setError(null);
    const res = await fetch("/api/triage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      setError("Could not update triage item");
      return;
    }
    setQueue((prev) => prev.filter((item) => item.id !== id));
    setSelected((ids) => ids.filter((selectedId) => selectedId !== id));
    } catch { setError("The request failed. Your input is preserved; try again."); }
    finally { busy.current = false; setPending(false); }

  }

  async function bulkSetStatus(status: "resolved" | "snoozed") {
    if (!can("triage.manage") || busy.current || selected.length === 0) return;
    const ids = [...selected];
    busy.current = true;
    setPending(true);
    try {
      setError(null);
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch("/api/triage", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
          });
          return { id, ok: res.ok };
        }),
      );
      const succeeded = new Set(results.filter((r) => r.ok).map((r) => r.id));
      if (succeeded.size === 0) {
        setError("Could not update triage items");
        return;
      }
      if (succeeded.size < ids.length) {
        setError("Some triage items could not be updated");
      }
      setQueue((prev) => prev.filter((item) => !succeeded.has(item.id)));
      setSelected((prev) => prev.filter((id) => !succeeded.has(id)));
    } catch {
      setError("The request failed. Your input is preserved; try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function fileIssue(item: QueueItem) {
    if (!item.resultId) {
      setError("This failure has no result to attach an issue to");
      return;
    }
    if (!can("triage.manage") || busy.current) return;
    busy.current = true; setPending(true);
    try {
    setError(null);
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        resultId: item.resultId,
        provider: issueProvider,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(data?.error ?? "Could not create issue");
      return;
    }
    setQueue((prev) => prev.filter((q) => q.id !== item.id));
    setSelected((ids) => ids.filter((id) => id !== item.id));
    } catch { setError("The request failed. Your input is preserved; try again."); }
    finally { busy.current = false; setPending(false); }

  }

  async function linkIssue(item: QueueItem) {
    if (!item.resultId) {
      setError("This failure has no result to attach an issue to");
      return;
    }
    const remoteKey = (linkKey[item.id] ?? "").trim();
    if (!remoteKey) return;
    if (!can("triage.manage") || busy.current) return;
    busy.current = true; setPending(true);
    try {
    setError(null);
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "link",
        resultId: item.resultId,
        remoteKey,
        provider: issueProvider,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(data?.error ?? "Could not link issue");
      return;
    }
    setQueue((prev) => prev.filter((q) => q.id !== item.id));
    setSelected((ids) => ids.filter((id) => id !== item.id));
    } catch { setError("The request failed. Your input is preserved; try again."); }
    finally { busy.current = false; setPending(false); }

  }

  function renderItem(item: QueueItem, nested = false) {
    return (
      <div
        id={`failure-${item.id}`}
        className={`flex flex-wrap items-start justify-between gap-3 ${
          nested ? "border-t border-[color:var(--topo-line)] px-3 py-3 pl-6" : ""
        }`}
      >
        {can("runs.create") || can("triage.manage") ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              aria-label={`Select ${item.caseKey || item.caseTitle}`}
              checked={selected.includes(item.id)}
              onChange={(event) =>
                setSelected((ids) =>
                  event.target.checked
                    ? [...ids, item.id]
                    : ids.filter((id) => id !== item.id),
                )
              }
            />
            Select
          </label>
        ) : null}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip mono>{item.priority}</StatusChip>
            <StatusChip tone="accent">{item.urgency}</StatusChip>
            {item.isFlaky ? (
              <StatusChip tone="warning">Flake</StatusChip>
            ) : null}
            {item.issueKey ? (
              item.issueUrl ? (
                <a
                  href={item.issueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex"
                >
                  <StatusChip tone="accent" mono>
                    {item.issueKey}
                  </StatusChip>
                </a>
              ) : (
                <StatusChip tone="accent" mono>
                  {item.issueKey}
                </StatusChip>
              )
            ) : (
              <StatusChip tone="danger">No issue</StatusChip>
            )}
          </div>
          <h2 className="mt-1.5 text-sm font-semibold text-[color:var(--topo-ink)]">
            <span className="font-mono text-[color:var(--topo-accent)]">
              {item.caseKey}
            </span>
            <span className="text-[color:var(--topo-muted)]"> · </span>
            {item.caseTitle}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
            {item.reason}
            {item.runId ? (
              <>
                {" · "}
                <Link
                  href={`/runs/${item.runId}${item.resultId ? `?result=${item.resultId}` : ""}`}
                  className="underline-offset-2 hover:underline"
                >
                  {item.runName}
                </Link>
              </>
            ) : null}
            {item.commitSha ? (
              <>
                {" · "}
                <span className="font-mono" title={item.commitSha}>
                  {item.commitSha.slice(0, 7)}
                </span>
              </>
            ) : null}
          </p>
          {item.notes ? (
            <div className="mt-2">
              <p
                className={`font-mono text-xs text-[color:var(--topo-muted)] ${
                  expandedNotes.has(item.id) ? "whitespace-pre-wrap" : "line-clamp-3"
                }`}
              >
                {item.notes}
              </p>
              {item.notes.length > 160 || item.notes.split("\n").length > 3 ? (
                <button
                  type="button"
                  className="mt-1 text-xs text-[color:var(--topo-accent)] hover:underline"
                  onClick={() =>
                    setExpandedNotes((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                >
                  {expandedNotes.has(item.id) ? "Show less" : "Show more"}
                </button>
              ) : null}
            </div>
          ) : null}
          {item.flakeHint ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {item.flakeHint}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap justify-end gap-2">
            {item.resultId ? (
              <Button
                size="sm"
                variant="primary"
                isDisabled={pending || !can("triage.manage")}
                onPress={() => void fileIssue(item)}
              >
                File issue
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pending || !can("triage.manage")}
              onPress={() => setStatus(item.id, "snoozed")}
            >
              Snooze
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pending || !can("triage.manage")}
              onPress={() => setStatus(item.id, "resolved")}
            >
              Resolve
            </Button>
          </div>
          {item.resultId && showIssueLink ? (
            <div className="flex flex-col items-end gap-1">
              {showDemoIssue ? (
                <StatusChip tone="neutral">Demo issue</StatusChip>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Input
                  aria-label="Issue key"
                  value={linkKey[item.id] ?? ""}
                  onChange={(e) =>
                    setLinkKey((prev) => ({
                      ...prev,
                      [item.id]: e.target.value,
                    }))
                  }
                  placeholder={showDemoIssue ? "Demo issue key" : "Issue key"}
                  className="w-40"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={pending || !can("triage.manage") || !(linkKey[item.id] ?? "").trim()}
                  onPress={() => void linkIssue(item)}
                >
                  Link
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {liveStatus !== "live" ? <p role="status" className="text-xs text-[color:var(--topo-muted)]">Reconnecting — failures may be out of date.</p> : null}
      <PageHeader
        eyebrow="Failures"
        title="Triage"
        description="Review failures, link an issue for follow-up, and resolve items when addressed. Similar failures are grouped together."
        meta={
          <>
            <StatusChip tone={queue.length ? "danger" : "success"} mono>
              {queue.length} open
            </StatusChip>
            <StatusChip tone="accent" mono>
              {clusters.length} signature{clusters.length === 1 ? "" : "s"}
            </StatusChip>
            <StatusChip tone="warning" mono>
              {flakeHints.length} flake hints
            </StatusChip>
          </>
        }
      />

      {selected.length > 0 && (can("runs.create") || can("triage.manage")) ? (
        <div className="topo-toolbar flex flex-wrap items-center gap-3">
          <span className="text-sm">{selected.length} selected failures</span>
          {can("runs.create") &&
          selected.some((id) => queue.find((item) => item.id === id)?.resultId) ? (
            <Link
              className="underline text-sm"
              href={`/runs/new?retest=${selected
                .map((id) => queue.find((item) => item.id === id)?.resultId)
                .filter(Boolean)
                .join(",")}`}
            >
              Review retest
            </Link>
          ) : null}
          {can("triage.manage") ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => void bulkSetStatus("snoozed")}
              >
                Snooze
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => void bulkSetStatus("resolved")}
              >
                Resolve
              </Button>
            </>
          ) : null}
          <button type="button" className="text-xs" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {queue.length === 0 ? (
        <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
          {flakeHints.length === 0
            ? "Nothing to triage yet. Record a failing result or import CI. Failures without an issue land here."
            : "Triage queue is clear — every failure has an issue or was resolved."}
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
          {clusters.map((cluster, i) => {
            const representative = queue.find(
              (q) => q.id === cluster.representative.id,
            );
            if (!representative) return null;
            const title = signatureTitle(representative);
            const isOpen =
              cluster.count === 1 || expanded.has(cluster.signatureId);
            const members = cluster.items
              .map((c) => queue.find((q) => q.id === c.id))
              .filter((item): item is QueueItem => Boolean(item));

            if (cluster.count === 1) {
              return (
                <motion.li
                  key={cluster.signatureId}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 10) * 0.02 }}
                  className="px-3 py-3"
                >
                  {renderItem(representative)}
                </motion.li>
              );
            }

            const summary = clusterSummaries[cluster.signatureId];
            return (
              <motion.li
                key={cluster.signatureId}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
              >
                <div className="flex w-full items-start justify-between gap-3 px-3 py-3">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleCluster(cluster.signatureId)}
                    className="min-w-0 flex-1 text-left hover:opacity-90"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip tone="danger" mono>
                        {cluster.count} failures
                      </StatusChip>
                      <StatusChip mono>{representative.priority}</StatusChip>
                      <StatusChip tone="accent">
                        {representative.urgency}
                      </StatusChip>
                      {representative.isFlaky ? (
                        <StatusChip tone="warning">Flake</StatusChip>
                      ) : null}
                    </div>
                    <h2 className="mt-1.5 text-sm font-semibold text-[color:var(--topo-ink)]">
                      {cluster.count} failure{cluster.count === 1 ? "" : "s"}{" "}
                      <span className="text-[color:var(--topo-muted)]">·</span>{" "}
                      <span className="font-normal text-[color:var(--topo-ink)]">
                        {title}
                      </span>
                    </h2>
                    <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
                      {representative.reason}
                      {" · "}
                      {isOpen ? "Hide failures" : "Show failures"}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={summarizingId === cluster.signatureId}
                      onPress={() =>
                        void summarizeCluster(cluster.signatureId, members)
                      }
                    >
                      {summarizingId === cluster.signatureId
                        ? "Summarizing…"
                        : "Summarize cluster"}
                    </Button>
                    <span
                      aria-hidden
                      className="font-mono text-xs text-[color:var(--topo-muted)]"
                    >
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </div>
                </div>
                {summary ? (
                  <p className="border-t border-[color:var(--topo-line)] px-3 py-2 text-xs text-[color:var(--topo-ink)]">
                    {summary}
                  </p>
                ) : null}
                {isOpen
                  ? members.map((item) => (
                      <div key={item.id}>{renderItem(item, true)}</div>
                    ))
                  : null}
              </motion.li>
            );
          })}
        </ul>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Flake hints
        </h2>
        {flakeHints.length === 0 ? (
          <p className="text-sm text-[color:var(--topo-muted)]">
            No flake suspects in recent history.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
            {flakeHints.map((hint) => (
              <li key={hint.caseId} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-[color:var(--topo-ink)]">
                  <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                    {hint.caseKey}
                  </span>
                  <StatusChip mono>score {hint.score}</StatusChip>
                </div>
                <div className="mt-1 text-xs text-[color:var(--topo-muted)]">
                  {hint.hint}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
