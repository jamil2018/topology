"use client";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, TextArea } from "@heroui/react";
import { EntityCollabPanel } from "./entity-collab-panel";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

type RequirementRow = {
  id: string;
  key: string;
  title: string;
  description: string;
  criticality: string;
  coversIntentIds: string[];
};

export function RequirementsWorkspace({
  initial,
  selectedId = null,
}: {
  initial: RequirementRow[];
  selectedId?: string | null;
}) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState<string | null>(
    selectedId && initial.some((row) => row.id === selectedId)
      ? selectedId
      : (initial[0]?.id ?? null),
  );
  const [error, setError] = useState<string | null>(null);
  const { can } = useProjectActions();
  const { saving, submit } = useMutationFeedback(setError);
  const pending = transitionPending || saving;
  const [draft, setDraft] = useState({
    key: "",
    title: "",
    description: "",
    criticality: "P2",
  });
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);

  async function draftCoverageProposal(requirementId: string) {
    if (!can("intents.edit") && !can("proposals.create")) return;
    return submit(async () => {
      setError(null);
      setProposalMessage(null);
      const res = await fetch("/api/ai/draft?heuristic=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: "intents_from_requirement",
          requirementId,
          allowHeuristic: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        proposalId?: string;
        heuristic?: boolean;
        model?: string;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not draft coverage proposal",
        );
        return;
      }
      setProposalMessage(
        data.proposalId
          ? `Coverage proposal queued${data.heuristic ? " (local template)" : data.model ? ` (${data.model})` : ""}.`
          : "Draft created.",
      );
      startTransition(() => router.refresh());
    });
  }

  async function createRequirement() {
    if (!can("requirements.create")) return;
    return submit(async () => {
    if (!draft.key.trim() || !draft.title.trim()) return;
    setError(null);
    const res = await fetch("/api/requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Could not create requirement",
      );
      return;
    }
    const row = data.requirement as RequirementRow;
    setItems((prev) => [{ ...row, coversIntentIds: [] }, ...prev]);
    setDraft({ key: "", title: "", description: "", criticality: "P2" });
    startTransition(() => router.refresh());
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quality graph"
        title="Requirements"
        description="Link requirements to test intents with covers edges. Coverage on the Hub stays N/A until requirements exist."
        meta={<StatusChip mono>{items.length}</StatusChip>}
      />

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {proposalMessage ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          {proposalMessage}{" "}
          <Link href="/proposals" className="underline">
            Open Proposals
          </Link>
        </p>
      ) : null}

      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          New requirement
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="topo-field"><span>Requirement key</span><Input
            aria-label="Requirement key"
            placeholder="REQ-AUTH-1"
            value={draft.key}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
          /></label>
          <label className="topo-field"><span>Criticality</span><Input
            aria-label="Criticality"
            value={draft.criticality}
            onChange={(e) =>
              setDraft((d) => ({ ...d, criticality: e.target.value }))
            }
          /></label>
        </div>
        <label className="topo-field"><span>Title</span><Input
          className="w-full"
          aria-label="Title"
          placeholder="Account lockout policy"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        /></label>
        <label className="topo-field"><span>Description</span><TextArea
          className="w-full"
          aria-label="Description"
          value={draft.description}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: e.target.value }))
          }
        /></label>
        <Button
          className="mt-3"
          onPress={() => void createRequirement()}
          isDisabled={pending || !can("requirements.create")}
        >
          Create requirement
        </Button>
      </div>

      <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[color:var(--topo-muted)]">
            No requirements yet. Add one to unlock requirement coverage on the Hub.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {items.map((req) => (
              <li key={req.id}>
                <button
                  type="button"
                  className={`w-full px-4 py-3 text-left ${
                    selected === req.id ? "bg-[color:var(--topo-chip)]/80" : ""
                  }`}
                  onClick={() => setSelected(req.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[color:var(--topo-ink)]">
                        <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                          {req.key}
                        </span>{" "}
                        {req.title}
                      </div>
                      {req.description ? (
                        <p className="mt-1 text-sm text-[color:var(--topo-muted)]">
                          {req.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip mono>{req.criticality}</StatusChip>
                      <StatusChip mono>
                        {req.coversIntentIds.length} intent
                        {req.coversIntentIds.length === 1 ? "" : "s"}
                      </StatusChip>
                    </div>
                  </div>
                </button>
                {selected === req.id ? (
                  <div className="space-y-3 border-t border-[color:var(--topo-line)] px-4 pb-4 pt-3">
                    {can("intents.edit") || can("proposals.create") ? (
                      <Button
                        size="sm"
                        variant={
                          req.coversIntentIds.length === 0
                            ? "secondary"
                            : "tertiary"
                        }
                        isDisabled={pending}
                        onPress={() => void draftCoverageProposal(req.id)}
                      >
                        Draft coverage proposal
                      </Button>
                    ) : null}
                    <EntityCollabPanel
                      entityType="requirement"
                      entityId={req.id}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
