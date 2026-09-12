"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { motion } from "motion/react";
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
  isFlaky?: boolean;
  flakeHint?: string | null;
};

type FlakeHint = {
  caseId: string;
  caseKey: string;
  title: string;
  score: number;
  hint: string;
};

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
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Failures"
        title="Triage"
        description="Ranked queue of open CI and manual failures. Flake suspects are demoted so real regressions surface first."
        meta={
          <>
            <StatusChip tone={queue.length ? "danger" : "success"} mono>
              {queue.length} open
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
          Triage queue is clear.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
          {queue.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.02 }}
              className="px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip mono>{item.priority}</StatusChip>
                    <StatusChip tone="accent">{item.urgency}</StatusChip>
                    {item.isFlaky ? (
                      <StatusChip tone="warning">Flake</StatusChip>
                    ) : null}
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
                <div className="flex gap-2">
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
                    variant="primary"
                    isDisabled={pending}
                    onPress={() => setStatus(item.id, "resolved")}
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            </motion.li>
          ))}
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
