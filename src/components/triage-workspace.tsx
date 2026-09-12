"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { motion } from "motion/react";

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
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--topo-ink)]">
          Failure triage
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--topo-muted)]">
          Ranked queue of open CI and manual failures. Flake suspects are
          demoted so real regressions surface first.
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {queue.length === 0 ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          Triage queue is clear.
        </p>
      ) : (
        <ul className="space-y-3">
          {queue.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-[color:var(--topo-muted)]">
                      {item.priority}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-[color:var(--topo-accent)]">
                      {item.urgency}
                    </span>
                    {item.isFlaky ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-900">
                        Flake
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-1 text-base text-[color:var(--topo-ink)]">
                    {item.caseKey}: {item.caseTitle}
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
                    <p className="mt-2 line-clamp-3 font-mono text-xs text-[color:var(--topo-muted)]">
                      {item.notes}
                    </p>
                  ) : null}
                  {item.flakeHint ? (
                    <p className="mt-2 text-xs text-amber-800">{item.flakeHint}</p>
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

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[color:var(--topo-ink)]">
          Flake hints
        </h2>
        {flakeHints.length === 0 ? (
          <p className="text-sm text-[color:var(--topo-muted)]">
            No flake suspects in recent history.
          </p>
        ) : (
          <ul className="space-y-2">
            {flakeHints.map((hint) => (
              <li
                key={hint.caseId}
                className="rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-3 text-sm"
              >
                <div className="text-[color:var(--topo-ink)]">
                  {hint.caseKey} · score {hint.score}
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
