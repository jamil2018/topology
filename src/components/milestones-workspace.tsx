"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type MilestoneView = {
  milestone: {
    id: string;
    name: string;
    description: string;
    status: string;
    passRateThreshold: number;
    maxOpenP0Failures: number;
    minExecutedPct: number;
    maxOpenBlockers: number;
  };
  readiness: {
    status: "go" | "at_risk" | "no_go";
    score: number;
    passRate: number | null;
    executedPct: number;
    openP0Failures: number;
    openBlockerIssues: number;
    reasons: string[];
  };
  badge: string;
};

export function MilestonesWorkspace({
  initial,
}: {
  initial: MilestoneView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    passRateThreshold: 95,
    maxOpenP0Failures: 0,
    minExecutedPct: 80,
    maxOpenBlockers: 0,
  });
  const [newName, setNewName] = useState("");

  function beginEdit(view: MilestoneView) {
    setEditingId(view.milestone.id);
    setDraft({
      passRateThreshold: view.milestone.passRateThreshold,
      maxOpenP0Failures: view.milestone.maxOpenP0Failures,
      minExecutedPct: view.milestone.minExecutedPct,
      maxOpenBlockers: view.milestone.maxOpenBlockers,
    });
  }

  async function saveThresholds(id: string) {
    setError(null);
    const res = await fetch("/api/milestones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...draft }),
    });
    if (!res.ok) {
      setError("Could not update thresholds");
      return;
    }
    const data = (await res.json()) as { readiness: MilestoneView | null };
    if (data.readiness) {
      setItems((prev) =>
        prev.map((item) =>
          item.milestone.id === id ? data.readiness! : item,
        ),
      );
    }
    setEditingId(null);
    startTransition(() => router.refresh());
  }

  async function createMilestone() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const res = await fetch("/api/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError("Could not create milestone");
      return;
    }
    setNewName("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Release"
        title="Milestones"
        description="Go / At-risk / No-Go from pass rate, execution progress, and open blocker issues. Thresholds are editable per milestone."
        meta={
          <StatusChip mono>
            {items.filter((i) => i.milestone.status === "active").length} active
          </StatusChip>
        }
      />

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <label className="min-w-[200px] flex-1 space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            New milestone
          </span>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="v1.2 release gate"
            className="w-full"
          />
        </label>
        <Button
          size="sm"
          variant="primary"
          isDisabled={pending || !newName.trim()}
          onPress={() => void createMilestone()}
        >
          Create
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
          No milestones yet. Create one to gate release readiness.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((view, i) => (
            <motion.li
              key={view.milestone.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[color:var(--topo-ink)]">
                      {view.milestone.name}
                    </h2>
                    <StatusChip
                      tone={statusToneForRun(view.readiness.status)}
                    >
                      {view.badge}
                    </StatusChip>
                    <StatusChip mono>{view.milestone.status}</StatusChip>
                  </div>
                  {view.milestone.description ? (
                    <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
                      {view.milestone.description}
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-1 text-xs text-[color:var(--topo-muted)]">
                    {view.readiness.reasons.map((reason) => (
                      <li key={reason}>· {reason}</li>
                    ))}
                  </ul>
                </div>
                <div className="text-right">
                  <div className="font-mono text-3xl font-semibold tabular-nums text-[color:var(--topo-ink)]">
                    {view.readiness.score}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                    score
                  </div>
                  <div className="mt-2 space-y-0.5 font-mono text-[11px] text-[color:var(--topo-muted)]">
                    <div>
                      pass{" "}
                      {view.readiness.passRate == null
                        ? "n/a"
                        : `${view.readiness.passRate}%`}
                    </div>
                    <div>executed {view.readiness.executedPct}%</div>
                    <div>
                      P0 fails {view.readiness.openP0Failures} · blockers{" "}
                      {view.readiness.openBlockerIssues}
                    </div>
                  </div>
                </div>
              </div>

              {editingId === view.milestone.id ? (
                <div className="mt-4 grid gap-3 border-t border-[color:var(--topo-line)] pt-4 sm:grid-cols-4">
                  {(
                    [
                      ["passRateThreshold", "Min pass %"],
                      ["minExecutedPct", "Min executed %"],
                      ["maxOpenP0Failures", "Max P0 fails"],
                      ["maxOpenBlockers", "Max blockers"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="space-y-1">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                        {label}
                      </span>
                      <Input
                        type="number"
                        value={String(draft[key])}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [key]: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  ))}
                  <div className="flex items-end gap-2 sm:col-span-4">
                    <Button
                      size="sm"
                      variant="primary"
                      isDisabled={pending}
                      onPress={() => void saveThresholds(view.milestone.id)}
                    >
                      Save thresholds
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--topo-line)] pt-3">
                  <StatusChip mono>
                    pass ≥ {view.milestone.passRateThreshold}%
                  </StatusChip>
                  <StatusChip mono>
                    executed ≥ {view.milestone.minExecutedPct}%
                  </StatusChip>
                  <StatusChip mono>
                    P0 ≤ {view.milestone.maxOpenP0Failures}
                  </StatusChip>
                  <StatusChip mono>
                    blockers ≤ {view.milestone.maxOpenBlockers}
                  </StatusChip>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => beginEdit(view)}
                  >
                    Edit thresholds
                  </Button>
                </div>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
