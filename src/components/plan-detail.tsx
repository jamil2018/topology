"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";
import { fanOutMatrix, type PlanMatrixInput } from "@/lib/tcm/matrix";

type PlanCase = {
  id: string;
  caseId: string;
  case?: { id: string; key: string; title: string; status: string } | null;
};

type PlanRun = { id: string; name: string; status: string };

type PickerCase = { id: string; key: string; title: string; status: string };

export function PlanDetail({
  plan,
  environments,
  cases,
}: {
  plan: {
    id: string;
    name: string;
    description: string;
    status: string;
    matrix: PlanMatrixInput;
    cases: PlanCase[];
    runs: PlanRun[];
  };
  environments: Array<{ id: string; name: string }>;
  cases: PickerCase[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(plan.cases.map((c) => c.caseId)),
  );
  const [search, setSearch] = useState("");

  const cellCount = fanOutMatrix(plan.matrix).length;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter(
      (c) =>
        !q ||
        c.key.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q),
    );
  }, [cases, search]);

  async function saveCases() {
    setError(null);
    const res = await fetch(`/api/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseIds: [...selected] }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save cases");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function launch() {
    setError(null);
    const res = await fetch(`/api/plans/${plan.id}/launch`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Launch failed");
      return;
    }
    const first = data.runs?.[0]?.id as string | undefined;
    startTransition(() => router.push(first ? `/runs/${first}` : "/runs"));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Test plan"
        title={plan.name}
        description={plan.description || "Attach cases, then launch the configuration matrix."}
        meta={
          <>
            <StatusChip tone="neutral">{plan.status}</StatusChip>
            <StatusChip mono>
              {selected.size} cases · {cellCount} runs
            </StatusChip>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/plans"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium"
            >
              All plans
            </Link>
            <Button
              size="sm"
              variant="primary"
              isDisabled={pending || selected.size === 0}
              onPress={() => void launch()}
            >
              Launch matrix
            </Button>
          </div>
        }
      />

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3 text-xs text-[color:var(--topo-muted)]">
        <p>
          Browsers: {(plan.matrix.browsers ?? []).join(", ") || "default"} · OS:{" "}
          {(plan.matrix.operatingSystems ?? []).join(", ") || "default"} · Envs:{" "}
          {(plan.matrix.environmentIds ?? [])
            .map((id) => environments.find((e) => e.id === id)?.name ?? id)
            .join(", ") || "default"}
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Search cases"
            placeholder="Filter cases…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button size="sm" variant="secondary" isDisabled={pending} onPress={() => void saveCases()}>
            Save case list
          </Button>
        </div>
        <ul className="max-h-80 divide-y divide-[color:var(--topo-line)] overflow-y-auto rounded-md border border-[color:var(--topo-line)]">
          {visible.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={(e) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    return next;
                  })
                }
              />
              <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                {c.key}
              </span>
              <span>{c.title}</span>
            </li>
          ))}
        </ul>
      </section>

      {plan.runs.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Runs from this plan</h2>
          <ul className="space-y-1">
            {plan.runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between rounded-md border border-[color:var(--topo-line)] px-3 py-2 text-sm"
                >
                  {run.name}
                  <StatusChip tone="neutral">{run.status}</StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
