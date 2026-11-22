"use client";
import { TopoCheckbox } from "./ui/topo-checkbox";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Input, Modal, TextArea, useOverlayState } from "@heroui/react";
import { PlayIcon } from "@phosphor-icons/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";
import { fanOutMatrix, type PlanMatrixInput } from "@/lib/tcm/matrix";
import {
  PlanMatrixFields,
  BROWSER_PRESETS,
  OS_PRESETS,
} from "./plan-matrix-fields";
import { TopoSelect } from "./ui/topo-select";

type PlanCase = {
  id: string;
  caseId: string;
  case?: { id: string; key: string; title: string; status: string } | null;
};

type PlanRun = { id: string; name: string; status: string };

type PickerCase = { id: string; key: string; title: string; status: string };

type MilestoneOption = { id: string; name: string; status: string };

type LaunchedRun = { id: string; name: string; status: string };

const PLAN_STATUSES = ["draft", "active", "completed", "archived"] as const;

function sameIdSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

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
  const [savedCaseIds, setSavedCaseIds] = useState<Set<string>>(
    () => new Set(plan.cases.map((c) => c.caseId)),
  );
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
  const [launchedRuns, setLaunchedRuns] = useState<LaunchedRun[]>([]);
  const launchSummary = useOverlayState();

  const casesDirty = !sameIdSet(selected, savedCaseIds);

  useEffect(() => {
    if (!casesDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [casesDirty]);

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

  async function persistCases(ids: Set<string>) {
    const res = await fetch(`/api/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseIds: [...ids] }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : "Could not save cases",
      );
    }
    setSavedCaseIds(new Set(ids));
  }

  async function saveCases() {
    if (!can("runs.edit")) return;
    return submit(async () => {
      await persistCases(selected);
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
      if (casesDirty) {
        if (!can("runs.edit")) {
          throw new Error("Save case selection before launching");
        }
        await persistCases(selected);
      }
      const res = await fetch(`/api/plans/${plan.id}/launch`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Launch failed",
        );
      }
      const runs = (data.runs ?? []) as LaunchedRun[];
      setLaunchedRuns(runs);
      launchSummary.open();
      startTransition(() => router.refresh());
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
            {casesDirty ? (
              <StatusChip tone="warning">Unsaved case selection</StatusChip>
            ) : null}
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
              className="gap-1.5"
              isDisabled={pending || !can("runs.create") || selected.size === 0}
              onPress={() => void launch()}
            >
              <PlayIcon size={14} weight="bold" aria-hidden />
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

      {casesDirty ? (
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-[color:var(--topo-ink)]"
        >
          Case selection has unsaved changes. Save the case list, or launch will
          auto-save before creating matrix runs.
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
          <TopoSelect
            label="Status"
            ariaLabel="Status"
            className="w-40"
            value={status}
            isDisabled={!can("runs.edit")}
            onChange={setStatus}
            options={PLAN_STATUSES.map((s) => ({
              id: s,
              label: s,
            }))}
            compact
          />
          {milestones.length > 0 ? (
            <TopoSelect
              label="Milestone"
              ariaLabel="Milestone"
              className="w-48"
              value={milestoneId}
              isDisabled={!can("runs.edit")}
              onChange={setMilestoneId}
              options={[
                { id: "", label: "None" },
                ...milestones.map((m) => ({
                  id: m.id,
                  label: m.name,
                })),
              ]}
              compact
            />
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
                isDisabled={pending || !casesDirty}
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
              <TopoCheckbox compact isDisabled={!can("runs.edit")} isSelected={selected.has(c.id)} onChange={(isSelected) => setSelected((prev) => { const next = new Set(prev); if (isSelected) next.add(c.id); else next.delete(c.id); return next; })} />
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

      <Modal.Backdrop
        isOpen={launchSummary.isOpen}
        onOpenChange={launchSummary.setOpen}
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className="outline-none">
            <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
              <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                Matrix launch summary
              </Modal.Heading>
              <p className="text-sm text-[color:var(--topo-muted)]">
                Created {launchedRuns.length} run
                {launchedRuns.length === 1 ? "" : "s"} from this plan matrix.
              </p>
            </Modal.Header>
            <Modal.Body className="space-y-2 px-4 py-4">
              {launchedRuns.length === 0 ? (
                <p className="text-sm text-[color:var(--topo-muted)]">
                  No runs were returned from launch.
                </p>
              ) : (
                <ul className="space-y-1">
                  {launchedRuns.map((run) => (
                    <li key={run.id}>
                      <Link
                        href={`/runs/${run.id}`}
                        className="flex items-center justify-between rounded-md border border-[color:var(--topo-line)] px-3 py-2 text-sm hover:bg-[color:var(--topo-chip)]/60"
                        onClick={() => launchSummary.close()}
                      >
                        <span className="font-medium">{run.name}</span>
                        <StatusChip tone="neutral">{run.status}</StatusChip>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2 border-t border-[color:var(--topo-line)] px-4 py-3">
              {launchedRuns[0] ? (
                <Button
                  size="sm"
                  variant="primary"
                  onPress={() => {
                    const first = launchedRuns[0];
                    launchSummary.close();
                    startTransition(() => router.push(`/runs/${first.id}`));
                  }}
                >
                  Open first run
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onPress={() => launchSummary.close()}
              >
                Stay on plan
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
