"use client";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Input, Modal, TextArea, useOverlayState } from "@heroui/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";
import { formatStatusLabel } from "@/lib/format-labels";
import { fanOutMatrix, type PlanMatrixInput } from "@/lib/tcm/matrix";
import { PlanMatrixFields, BROWSER_PRESETS, OS_PRESETS } from "./plan-matrix-fields";

export type PlanListItem = {
  id: string;
  name: string;
  description: string;
  status: string;
  matrix: PlanMatrixInput;
  caseCount: number;
  runCount: number;
  milestoneId?: string | null;
};

type EnvOption = { id: string; name: string; kind: string };
type MilestoneOption = { id: string; name: string; status: string };

export function PlansWorkspace({
  initialPlans,
  environments,
  milestones = [],
}: {
  initialPlans: PlanListItem[];
  environments: EnvOption[];
  milestones?: MilestoneOption[];
}) {
  const router = useRouter();
  const { can } = useProjectActions();
  const [transitionPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { saving, submit } = useMutationFeedback(setError);
  const pending = transitionPending || saving;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [browsers, setBrowsers] = useState<string[]>(["Chrome"]);
  const [oses, setOses] = useState<string[]>(["macOS"]);
  const [envIds, setEnvIds] = useState<string[]>([]);
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dialog = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setError(null);
    },
  });

  const previewCount = useMemo(
    () =>
      fanOutMatrix({
        browsers,
        operatingSystems: oses,
        environmentIds: envIds,
      }).length,
    [browsers, oses, envIds],
  );

  function resetDraft() {
    setName("");
    setDescription("");
    setBrowsers(["Chrome"]);
    setOses(["macOS"]);
    setEnvIds([]);
    setMilestoneId("");
    setError(null);
  }

  async function createPlan() {
    if (!can("runs.create")) return;
    return submit(async () => {
      if (!name.trim()) return;
      setError(null);
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description,
          milestoneId: milestoneId || null,
          matrix: {
            browsers,
            operatingSystems: oses,
            environmentIds: envIds,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not create plan",
        );
        return;
      }
      const id = data.plan?.id as string | undefined;
      resetDraft();
      dialog.close();
      if (id) {
        startTransition(() => router.push(`/plans/${id}`));
        return;
      }
      startTransition(() => router.refresh());
    });
  }

  async function archivePlan(id: string) {
    if (!can("runs.edit")) return;
    return submit(async () => {
      const res = await fetch(`/api/plans/${id}`, {
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
      setArchivingId(null);
      startTransition(() => router.refresh());
    });
  }

  async function deletePlan(id: string) {
    if (!can("runs.delete")) return;
    return submit(async () => {
      const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not delete",
        );
      }
      setDeletingId(null);
      startTransition(() => router.refresh());
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Test management"
        title="Plans"
        description="Group cases to test across different browsers, operating systems, and environments."
        meta={<StatusChip mono>{initialPlans.length} plans</StatusChip>}
        actions={
          <Button
            size="sm"
            variant="primary"
            isDisabled={!can("runs.create")}
            onPress={() => dialog.open()}
          >
            New plan
          </Button>
        }
      />

      {error && !dialog.isOpen ? (
        <p role="alert" className="text-sm text-[color:var(--topo-danger)]">
          {error}
        </p>
      ) : null}

      {initialPlans.length === 0 ? (
        <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
          No plans yet. Create a plan, add cases, then start its test runs.
        </p>
      ) : (
        <ul className="space-y-2">
          {initialPlans.map((plan, i) => (
            <motion.li
              key={plan.id}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
              className="flex items-stretch gap-2"
            >
              <Link
                href={`/plans/${plan.id}`}
                className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3 transition hover:border-[color:var(--topo-accent)]"
              >
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                    {plan.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    {plan.caseCount} cases · {plan.runCount} runs
                  </p>
                </div>
                <StatusChip tone="neutral">
                  {formatStatusLabel(plan.status)}
                </StatusChip>
              </Link>
              <div className="flex flex-col justify-center gap-1">
                {can("runs.edit") && plan.status !== "archived" ? (
                  archivingId === plan.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={pending}
                        onPress={() => void archivePlan(plan.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="tertiary"
                        isDisabled={pending}
                        onPress={() => setArchivingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={pending}
                      onPress={() => {
                        setDeletingId(null);
                        setArchivingId(plan.id);
                      }}
                    >
                      Archive
                    </Button>
                  )
                ) : null}
                {can("runs.delete") ? (
                  deletingId === plan.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        isDisabled={pending}
                        onPress={() => void deletePlan(plan.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="tertiary"
                        isDisabled={pending}
                        onPress={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={pending}
                      onPress={() => {
                        setArchivingId(null);
                        setDeletingId(plan.id);
                      }}
                    >
                      Delete
                    </Button>
                  )
                ) : null}
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      <Modal.Backdrop
        isOpen={dialog.isOpen}
        onOpenChange={dialog.setOpen}
        isDismissable={!pending}
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className="outline-none">
            <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
              <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                New plan
              </Modal.Heading>
              <p className="text-sm text-[color:var(--topo-muted)]">
                Name the plan, then pick browsers and operating systems as tags.
                Launch later from the plan detail.
              </p>
            </Modal.Header>
            <Modal.Body className="space-y-3 px-4 py-4">
              {error ? (
                <p
                  role="alert"
                  className="text-sm text-[color:var(--topo-danger)]"
                >
                  {error}
                </p>
              ) : null}
              <label htmlFor="plan-name" className="block text-sm">
                Plan name (required)
              </label>
              <Input
                id="plan-name"
                aria-label="Plan name"
                placeholder="Release 2.4 checkout"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="plan-description" className="block text-sm">
                Description (optional)
              </label>
              <TextArea
                id="plan-description"
                aria-label="Description"
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-14"
              />
              {milestones.length > 0 ? (
                <label className="block space-y-1 text-sm">
                  <span>Milestone (optional)</span>
                  <select
                    className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
                    value={milestoneId}
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
                Launch will create {previewCount} run
                {previewCount === 1 ? "" : "s"}.
              </p>
            </Modal.Body>
            {!name.trim() ? (
              <p
                role="status"
                className="px-4 text-sm text-[color:var(--topo-muted)]"
              >
                Enter a plan name to continue.
              </p>
            ) : null}
            <Modal.Footer className="flex justify-end gap-2 border-t border-[color:var(--topo-line)] px-4 py-3">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => dialog.close()}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                isDisabled={pending || !can("runs.create") || !name.trim()}
                onPress={() => void createPlan()}
              >
                Create plan
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
