"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { motion } from "motion/react";
import { clusterTriageBySignature } from "@topology/domain";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

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
}: {
  initialQueue: QueueItem[];
  flakeHints: FlakeHint[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [queue, setQueue] = useState(initialQueue);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [linkKey, setLinkKey] = useState<Record<string, string>>({});

  const clusters = toClusterItems(queue);

  function toggleCluster(signatureId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(signatureId)) next.delete(signatureId);
      else next.add(signatureId);
      return next;
    });
  }

  async function setStatus(id: string, status: "resolved" | "snoozed") {
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
    startTransition(() => router.refresh());
  }

  async function fileIssue(item: QueueItem) {
    if (!item.resultId) {
      setError("This failure has no result to attach an issue to");
      return;
    }
    setError(null);
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        resultId: item.resultId,
        provider: "mock",
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
    startTransition(() => router.refresh());
  }

  async function linkIssue(item: QueueItem) {
    if (!item.resultId) {
      setError("This failure has no result to attach an issue to");
      return;
    }
    const remoteKey = (linkKey[item.id] ?? "").trim();
    if (!remoteKey) return;
    setError(null);
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "link",
        resultId: item.resultId,
        remoteKey,
        provider: "mock",
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
    startTransition(() => router.refresh());
  }

  function renderItem(item: QueueItem, nested = false) {
    return (
      <div
        className={`flex flex-wrap items-start justify-between gap-3 ${
          nested ? "border-t border-[color:var(--topo-line)] px-3 py-3 pl-6" : ""
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip mono>{item.priority}</StatusChip>
            <StatusChip tone="accent">{item.urgency}</StatusChip>
            {item.isFlaky ? (
              <StatusChip tone="warning">Flake</StatusChip>
            ) : null}
            <StatusChip tone="danger">No issue</StatusChip>
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
                  href={`/runs/${item.runId}`}
                  className="underline-offset-2 hover:underline"
                >
                  {item.runName}
                </Link>
              </>
            ) : null}
          </p>
          {item.notes ? (
            <p className="mt-2 line-clamp-3 font-mono text-[11px] text-[color:var(--topo-muted)]">
              {item.notes}
            </p>
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
                isDisabled={pending}
                onPress={() => void fileIssue(item)}
              >
                File issue
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pending}
              onPress={() => setStatus(item.id, "snoozed")}
            >
              Snooze
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pending}
              onPress={() => setStatus(item.id, "resolved")}
            >
              Resolve
            </Button>
          </div>
          {item.resultId ? (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Input
                value={linkKey[item.id] ?? ""}
                onChange={(e) =>
                  setLinkKey((prev) => ({
                    ...prev,
                    [item.id]: e.target.value,
                  }))
                }
                placeholder="Link key (MOCK-1)"
                className="w-40"
              />
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending || !(linkKey[item.id] ?? "").trim()}
                onPress={() => void linkIssue(item)}
              >
                Link
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Failures"
        title="Triage"
        description="Failed results without a linked issue, grouped by failure signature. File or link a tracker issue, then resolve. Flake suspects are demoted so real regressions surface first."
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

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {queue.length === 0 ? (
        <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
          Triage queue is clear — every failure has an issue or was resolved.
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
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 10) * 0.02 }}
                  className="px-3 py-3"
                >
                  {renderItem(representative)}
                </motion.li>
              );
            }

            return (
              <motion.li
                key={cluster.signatureId}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleCluster(cluster.signatureId)}
                  className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-[color:var(--topo-chip)]/40"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip tone="danger" mono>
                        {cluster.count} →
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
                      <span className="font-mono text-[color:var(--topo-muted)]">
                        {cluster.count}
                      </span>
                      <span className="text-[color:var(--topo-muted)]">
                        {" "}
                        →{" "}
                      </span>
                      {title}
                    </h2>
                    <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
                      {representative.reason}
                      {" · "}
                      {isOpen ? "Hide failures" : "Show failures"}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="mt-1 font-mono text-xs text-[color:var(--topo-muted)]"
                  >
                    {isOpen ? "▾" : "▸"}
                  </span>
                </button>
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
