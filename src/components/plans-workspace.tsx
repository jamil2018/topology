"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Input, Modal, TextArea, useOverlayState } from "@heroui/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";
import { formatStatusLabel } from "@/lib/format-labels";
import { fanOutMatrix, type PlanMatrixInput } from "@/lib/tcm/matrix";

export type PlanListItem = {
  id: string;
  name: string;
  description: string;
  status: string;
  matrix: PlanMatrixInput;
  caseCount: number;
  runCount: number;
};

type EnvOption = { id: string; name: string; kind: string };

const BROWSER_PRESETS = ["Chrome", "Firefox", "Safari", "Edge"];
const OS_PRESETS = ["macOS", "Windows", "Linux", "iOS", "Android"];

export function PlansWorkspace({
  initialPlans,
  environments,
}: {
  initialPlans: PlanListItem[];
  environments: EnvOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [browsers, setBrowsers] = useState<string[]>(["Chrome"]);
  const [oses, setOses] = useState<string[]>(["macOS"]);
  const [envIds, setEnvIds] = useState<string[]>([]);
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
    setError(null);
  }

  async function createPlan() {
    if (!name.trim()) return;
    setError(null);
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description,
        matrix: {
          browsers,
          operatingSystems: oses,
          environmentIds: envIds,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not create plan");
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
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Test management"
        title="Plans"
        description="Group cases into a plan, then fan out runs across a browser × OS × environment matrix."
        meta={<StatusChip mono>{initialPlans.length} plans</StatusChip>}
        actions={
          <Button size="sm" variant="primary" onPress={() => dialog.open()}>
            New plan
          </Button>
        }
      />

      {initialPlans.length === 0 ? (
        <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
          No plans yet. Create one, attach cases, then launch the matrix.
        </p>
      ) : (
        <ul className="space-y-2">
          {initialPlans.map((plan, i) => (
            <motion.li
              key={plan.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
            >
              <Link
                href={`/plans/${plan.id}`}
                className="flex items-start justify-between gap-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3 transition hover:border-[color:var(--topo-accent)]"
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
            </motion.li>
          ))}
        </ul>
      )}

      <Modal.Root state={dialog}>
        <Modal.Backdrop isDismissable={!pending}>
          <Modal.Container placement="center" size="md">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  New plan
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  Name the plan, then pick browsers and operating systems as
                  tags. Launch later from the plan detail.
                </p>
              </Modal.Header>
              <Modal.Body className="space-y-3 px-4 py-4">
                {error ? (
                  <p className="text-sm text-[color:var(--topo-danger)]">{error}</p>
                ) : null}
                <Input
                  aria-label="Plan name"
                  placeholder="Release 2.4 checkout"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <TextArea
                  aria-label="Description"
                  placeholder="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-14"
                />
                <TagInput
                  label="Browsers"
                  value={browsers}
                  onChange={setBrowsers}
                  presets={BROWSER_PRESETS}
                  placeholder="Add a browser"
                />
                <TagInput
                  label="Operating systems"
                  value={oses}
                  onChange={setOses}
                  presets={OS_PRESETS}
                  placeholder="Add an OS"
                />
                {environments.length > 0 ? (
                  <fieldset className="space-y-1">
                    <legend className="text-xs text-[color:var(--topo-muted)]">
                      Environments
                    </legend>
                    <div className="flex flex-wrap gap-3">
                      {environments.map((env) => (
                        <label
                          key={env.id}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={envIds.includes(env.id)}
                            onChange={(e) =>
                              setEnvIds((prev) =>
                                e.target.checked
                                  ? [...prev, env.id]
                                  : prev.filter((id) => id !== env.id),
                              )
                            }
                          />
                          {env.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <p className="text-xs text-[color:var(--topo-muted)]">
                    No named environments yet — runs will use the default local
                    target.
                  </p>
                )}
                <p className="text-xs text-[color:var(--topo-muted)]">
                  Launch will create {previewCount} run
                  {previewCount === 1 ? "" : "s"}.
                </p>
              </Modal.Body>
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
                  isDisabled={pending || !name.trim()}
                  onPress={() => void createPlan()}
                >
                  Create plan
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}

function TagInput({
  label,
  value,
  onChange,
  presets,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  presets: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add(tag: string) {
    const next = tag.trim();
    if (!next || value.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, next]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[color:var(--topo-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <button
            key={tag}
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)] px-2 py-0.5 text-xs text-[color:var(--topo-ink)]"
            onClick={() => onChange(value.filter((item) => item !== tag))}
            aria-label={`Remove ${tag}`}
          >
            {tag}
            <span aria-hidden className="text-[color:var(--topo-muted)]">
              ×
            </span>
          </button>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-[8rem] flex-1 bg-transparent text-sm text-[color:var(--topo-ink)] outline-none placeholder:text-[color:var(--topo-muted)]"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => {
          const selected = value.some(
            (item) => item.toLowerCase() === preset.toLowerCase(),
          );
          return (
            <button
              key={preset}
              type="button"
              disabled={selected}
              onClick={() => add(preset)}
              className={`rounded-md px-2 py-0.5 text-[11px] ${
                selected
                  ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
                  : "border border-[color:var(--topo-line)] text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
              }`}
            >
              {preset}
            </button>
          );
        })}
      </div>
    </div>
  );
}
