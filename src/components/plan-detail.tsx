"use client";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Input, TextArea } from "@heroui/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";
import { fanOutMatrix, type PlanMatrixInput } from "@/lib/tcm/matrix";
import {
  PlanMatrixFields,
  BROWSER_PRESETS,
  OS_PRESETS,
} from "./plan-matrix-fields";

type PlanCase = {
  id: string;
  caseId: string;
  case?: { id: string; key: string; title: string; status: string } | null;
};

type PlanRun = { id: string; name: string; status: string };

type PickerCase = { id: string; key: string; title: string; status: string };

type MilestoneOption = { id: string; name: string; status: string };

const PLAN_STATUSES = ["draft", "active", "completed", "archived"] as const;

export function PlanDetail({
  plan,
  environments,
  cases,
  milestones = [],
}: {
  plan: {
    id: string;
    name: string;
    description: string;
    status: string;
    milestoneId?: string | null;
    matrix: PlanMatrixInput;
    cases: PlanCase[];
    runs: PlanRun[];
  };
  environments: Array<{ id: string; name: string }>;
  cases: PickerCase[];
  milestones?: MilestoneOption[];
}) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { can } = useProjectActions();
  const { saving, submit } = useMutationFeedback(setError);
  const pending = transitionPending || saving;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(plan.cases.map((c) => c.caseId)),
  );
  const [search, setSearch] = useState("");
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? "");
  const [status, setStatus] = useState(plan.status);
  const [milestoneId, setMilestoneId] = useState(plan.milestoneId ?? "");
  const [browsers, setBrowsers] = useState<string[]>(() => [
    ...(plan.matrix.browsers ?? []),
  ]);
  const [oses, setOses] = useState<string[]>(() => [
    ...(plan.matrix.operatingSystems ?? []),
  ]);
  const [envIds, setEnvIds] = useState<string[]>(() => [
    ...(plan.matrix.environmentIds ?? []),
  ]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cellCount = fanOutMatrix({
    browsers,
    operatingSystems: oses,
    environmentIds: envIds,
  }).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter(
      (c) =>
        !q ||
        c.key.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q),
    );
  }, [cases, search]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((c) => selected.has(c.id));

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) next.add(c.id);
      return next;
    });
  }

  function clearFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) next.delete(c.id);
      return next;
    });
  }

  async function saveMeta() {
    if (!can("runs.edit")) return;
    return submit(async () => {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description,
          status,
          milestoneId: milestoneId || null,
          matrix: {
            browsers,
            operatingSystems: oses,
            environmentIds: envIds,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not save plan",
        );
      }
      startTransition(() => router.refresh());
    });
  }

  async function saveCases() {
    if (!can("runs.edit")) return;
    return submit(async () => {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: [...selected] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Could not save cases",
        );
      }
      startTransition(() => router.refresh());
    });
  }

  async function archive() {
    if (!can("runs.edit")) return;
    return submit(async () => {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not archive",
        );
      }
      setStatus("archived");
      startTransition(() => router.refresh());
    });
  }

  async function remove() {
    if (!can("runs.delete")) return;
    return submit(async () => {
      const res = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not delete",
        );
      }
      startTransition(() => router.push("/plans"));
    });
  }

  async function launch() {
    if (!can("runs.create")) return;
    return submit(async () => {
      const res = await fetch(`/api/plans/${plan.id}/launch`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Launch failed",
        );
      }
      const first = data.runs?.[0]?.id as string | undefined;
      startTransition(() => router.push(first ? `/runs/${first}` : "/runs"));
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Test plan"
        title={plan.name}
        description={
          plan.description ||
          "Attach cases, then launch the configuration matrix."
        }
        meta={
          <>
            <StatusChip tone="neutral">{status}</StatusChip>
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
            {can("runs.edit") && status !== "archived" ? (
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => void archive()}
              >
                Archive
              </Button>
            ) : null}
            {can("runs.delete") ? (
              confirmDelete ? (
                <>
                  <Button
                    size="sm"
                    variant="danger"
                    isDisabled={pending}
                    onPress={() => void remove()}
                  >
                    Confirm delete
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={pending}
                    onPress={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="tertiary"
                  isDisabled={pending}
                  onPress={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              )
            ) : null}
            <Button
              size="sm"
              variant="primary"
              isDisabled={pending || !can("runs.create") || selected.size === 0}
              onPress={() => void launch()}
            >
              Launch matrix
            </Button>
          </div>
        }
      />

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <section className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Plan details
        </h2>
        <label className="block space-y-1 text-sm">
          <span>Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!can("runs.edit")}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Description</span>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-14"
            disabled={!can("runs.edit")}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1 text-sm">
            <span className="block">Status</span>
            <select
              className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
              value={status}
              disabled={!can("runs.edit")}
              onChange={(e) => setStatus(e.target.value)}
            >
              {PLAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {milestones.length > 0 ? (
            <label className="space-y-1 text-sm">
              <span className="block">Milestone</span>
              <select
                className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
                value={milestoneId}
                disabled={!can("runs.edit")}
                onChange={(e) => setMilestoneId(e.target.value)}
              >
                <option value="">None</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {can("runs.edit") ? (
          <>
            <PlanMatrixFields
              browsers={browsers}
              oses={oses}
              envIds={envIds}
              environments={environments}
              onBrowsers={setBrowsers}
              onOses={setOses}
              onEnvIds={setEnvIds}
              browserPresets={BROWSER_PRESETS}
              osPresets={OS_PRESETS}
            />
            <p className="text-xs text-[color:var(--topo-muted)]">
              Matrix fans out to {cellCount} run
              {cellCount === 1 ? "" : "s"} on launch.
            </p>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pending || !name.trim()}
              onPress={() => void saveMeta()}
            >
              Save plan
            </Button>
          </>
        ) : (
          <p className="text-xs text-[color:var(--topo-muted)]">
            Browsers: {(browsers.length ? browsers : ["default"]).join(", ")} ·
            OS: {(oses.length ? oses : ["default"]).join(", ")} · Envs:{" "}
            {(envIds.length
              ? envIds.map(
                  (id) => environments.find((e) => e.id === id)?.name ?? id,
                )
              : ["default"]
            ).join(", ")}
          </p>
        )}
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
          {can("runs.edit") ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending || visible.length === 0}
                onPress={() =>
                  allVisibleSelected ? clearFiltered() : selectAllFiltered()
                }
              >
                {allVisibleSelected
                  ? "Clear filtered"
                  : "Select all filtered"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => void saveCases()}
              >
                Save case list
              </Button>
            </>
          ) : null}
        </div>
        <ul className="max-h-80 divide-y divide-[color:var(--topo-line)] overflow-y-auto rounded-md border border-[color:var(--topo-line)]">
          {visible.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <input
                type="checkbox"
                disabled={!can("runs.edit")}
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
