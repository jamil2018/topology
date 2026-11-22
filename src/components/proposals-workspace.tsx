"use client";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { motion } from "motion/react";
import type { ProposalDiff } from "@topology/domain";
import { isUuid } from "@/lib/queries/ids";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

export type ProposalListItem = {
  id: string;
  entityType: string;
  status: string;
  actorType: string;
  model: string | null;
  inputRefs: string[];
  rationale: string | null;
  diffs: ProposalDiff[];
  createdById: string | null;
  approvedById: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type AppliedChange = {
  action: string;
  entityType: string;
  id: string;
  key?: string;
};

function summarizeDiff(diff: ProposalDiff): string {
  const after = diff.after ?? {};
  const key =
    typeof after.key === "string"
      ? after.key
      : typeof after.toKey === "string"
        ? after.toKey
        : typeof after.fromKey === "string"
          ? after.fromKey
          : null;
  const title = typeof after.title === "string" ? after.title : typeof after.name === "string" ? after.name : null;
  const relation =
    typeof after.relation === "string" ? after.relation : null;
  if (diff.action === "link") {
    return `${diff.action} ${diff.entityType}${relation ? ` (${relation})` : ""}`;
  }
  if (key && title) return `${diff.action} ${diff.entityType} ${key}: ${title}`;
  if (key) return `${diff.action} ${diff.entityType} ${key}`;
  if (title) return `${diff.action} ${diff.entityType} ${title}`;
  return `${diff.action} ${diff.entityType}`;
}

function appliedEntityHref(change: AppliedChange): string | null {
  switch (change.entityType) {
    case "intent":
      return `/intents?intent=${encodeURIComponent(change.id)}`;
    case "requirement":
      return `/requirements?requirement=${encodeURIComponent(change.id)}`;
    case "risk":
      return "/risks";
    case "component":
      return "/components";
    case "implementation":
      return change.key
        ? `/cases?q=${encodeURIComponent(change.key)}`
        : "/intents";
    case "case":
      return change.key
        ? `/cases/${encodeURIComponent(change.key)}`
        : `/cases?case=${encodeURIComponent(change.id)}`;
    case "plan":
      return `/plans/${change.id}`;
    case "run_template":
      return `/runs/new?template=${change.id}`;
    default:
      return null;
  }
}

function appliedEntityLabel(change: AppliedChange): string {
  const keyBit = change.key ? ` ${change.key}` : "";
  return `${change.entityType}${keyBit}`;
}

export function ProposalsWorkspace({
  initial,
  aiProvider,
}: {
  initial: ProposalListItem[];
  aiProvider: string;
}) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [acceptNotice, setAcceptNotice] = useState<{
    proposalId: string;
    applied: AppliedChange[];
  } | null>(null);
  const { can } = useProjectActions();
  const { saving, submit } = useMutationFeedback(setError);
  const pending = transitionPending || saving;

  const queue = items.filter((p) => p.status === "pending");

  async function draftCoverageProposal() {
    if (!can("intents.edit") && !can("proposals.create")) return;
    return submit(async () => {
      setError(null);
      setDraftMessage(null);
      const res = await fetch("/api/ai/draft?heuristic=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: "link_suggestions",
          allowHeuristic: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        proposalId?: string;
        heuristic?: boolean;
        model?: string;
        proposal?: ProposalListItem;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not draft coverage proposal",
        );
        return;
      }
      const listRes = await fetch("/api/proposals?status=pending");
      if (listRes.ok) {
        const listData = (await listRes.json()) as {
          proposals?: ProposalListItem[];
        };
        if (listData.proposals) setItems(listData.proposals);
      }
      setDraftMessage(
        data.proposalId
          ? `Coverage proposal queued${data.heuristic ? " (local template)" : data.model ? ` (${data.model})` : ""}.`
          : "Draft created.",
      );
      startTransition(() => router.refresh());
    });
  }

  async function review(id: string, status: "accepted" | "rejected") {
    if (!can("proposals.review")) return;
    return submit(async () => {
    setError(null);
    if (status === "accepted") setAcceptNotice(null);
    const res = await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      proposal?: ProposalListItem;
      applied?: AppliedChange[];
    };
    if (!res.ok) {
      setError(data.error ?? `Failed to ${status.slice(0, -2)}`);
      return;
    }
    if (data.proposal) {
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...data.proposal! } : p)),
      );
    }
    if (status === "accepted") {
      setAcceptNotice({
        proposalId: id,
        applied: data.applied ?? [],
      });
    }
    startTransition(() => router.refresh());
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Proposals"
        description="Review agent and model suggestions before they write to the quality graph. Accept applies create/link diffs; reject leaves the graph unchanged."
        meta={
          <>
            <StatusChip tone={aiProvider === "none" ? "neutral" : "info"} mono>
              AI provider: {aiProvider}
            </StatusChip>
            <StatusChip tone={queue.length ? "warning" : "neutral"} mono>
              {queue.length} pending
            </StatusChip>
          </>
        }
      />

      {aiProvider === "none" ? (
        <p className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2 text-sm text-[color:var(--topo-muted)]">
          AI is optional. Topology works with provider{" "}
          <code className="font-mono text-xs">none</code>. Agents can still
          submit proposals via MCP; in-app generation stays off until{" "}
          <code className="font-mono text-xs">TOPOLOGY_AI_PROVIDER</code> is
          set.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {draftMessage ? (
        <p className="text-sm text-[color:var(--topo-muted)]">{draftMessage}</p>
      ) : null}

      {acceptNotice ? (
        <p
          role="status"
          className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2 text-sm text-[color:var(--topo-ink)]"
        >
          Proposal accepted
          {acceptNotice.applied.length > 0 ? (
            <>
              {" · "}
              {acceptNotice.applied.slice(0, 4).map((change, i) => {
                const href = appliedEntityHref(change);
                const label = appliedEntityLabel(change);
                return (
                  <span key={`${change.entityType}-${change.id}-${i}`}>
                    {i > 0 ? ", " : null}
                    {href ? (
                      <Link href={href} className="underline">
                        Open {label}
                      </Link>
                    ) : (
                      <span>{label}</span>
                    )}
                  </span>
                );
              })}
              {acceptNotice.applied.length > 4
                ? ` (+${acceptNotice.applied.length - 4} more)`
                : null}
            </>
          ) : (
            <>
              {" · "}
              <Link href="/intents" className="underline">
                Open workspace
              </Link>
            </>
          )}
        </p>
      ) : null}

      {queue.length === 0 ? (
        <div className="space-y-3 rounded-md border border-dashed border-[color:var(--topo-line)] px-4 py-6">
          <p className="text-sm text-[color:var(--topo-muted)]">
            No pending proposals. Draft a coverage suggestion in-app, or use MCP{" "}
            <code className="font-mono text-xs">propose_coverage</code> without
            writing the graph.
          </p>
          {(can("intents.edit") || can("proposals.create")) ? (
            <Button
              size="sm"
              variant="primary"
              isDisabled={pending}
              onPress={() => void draftCoverageProposal()}
            >
              Draft coverage proposal
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {queue.map((item, index) => (
            <motion.li
              key={item.id}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.03, 0.2) }}
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip tone="info" mono>
                      {item.entityType}
                    </StatusChip>
                    <StatusChip tone="neutral" mono>
                      {item.actorType}
                    </StatusChip>
                    {item.model ? (
                      <StatusChip tone="neutral" mono>
                        {item.model}
                      </StatusChip>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium text-[color:var(--topo-ink)]">
                    {item.rationale?.trim() || "Proposed graph change"}
                  </p>
                  <ul className="space-y-0.5 font-mono text-xs text-[color:var(--topo-muted)]">
                    {item.diffs.map((diff, i) => (
                      <li key={`${item.id}-${i}`}>
                        {["case", "plan", "run_template"].includes(diff.entityType) ? (
                          <details>
                            <summary className="cursor-pointer">{summarizeDiff(diff)}</summary>
                            {diff.before ? (
                              <>
                                <p className="mt-2 font-semibold">Before</p>
                                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(diff.before, null, 2)}</pre>
                              </>
                            ) : null}
                            <p className="mt-2 font-semibold">Proposed</p>
                            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(diff.after, null, 2)}</pre>
                          </details>
                        ) : summarizeDiff(diff)}
                      </li>
                    ))}
                  </ul>
                  {item.inputRefs.length > 0 ? (
                    <p className="text-xs text-[color:var(--topo-muted)]">
                      Refs: {item.inputRefs.map((ref, index) => (
                        <span key={`${index}-${ref}`}>
                          {index > 0 ? ", " : ""}
                          {ref.startsWith("/runs/") && isUuid(ref.slice(6)) ? (
                            <Link href={ref} className="underline">Open source run</Link>
                          ) : ref}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={pending || !can("proposals.review")}
                    onPress={() => void review(item.id, "rejected")}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    isDisabled={pending || !can("proposals.review")}
                    onPress={() => void review(item.id, "accepted")}
                  >
                    Accept
                  </Button>
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
