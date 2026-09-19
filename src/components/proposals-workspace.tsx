"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { motion } from "motion/react";
import type { ProposalDiff } from "@topology/domain";
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
  const title = typeof after.title === "string" ? after.title : null;
  const relation =
    typeof after.relation === "string" ? after.relation : null;
  if (diff.action === "link") {
    return `${diff.action} ${diff.entityType}${relation ? ` (${relation})` : ""}`;
  }
  if (key && title) return `${diff.action} ${diff.entityType} ${key}: ${title}`;
  if (key) return `${diff.action} ${diff.entityType} ${key}`;
  return `${diff.action} ${diff.entityType}`;
}

export function ProposalsWorkspace({
  initial,
  aiProvider,
}: {
  initial: ProposalListItem[];
  aiProvider: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const queue = items.filter((p) => p.status === "pending");

  async function review(id: string, status: "accepted" | "rejected") {
    setError(null);
    const res = await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      proposal?: ProposalListItem;
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
    startTransition(() => router.refresh());
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
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {queue.length === 0 ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          No pending proposals. Use MCP{" "}
          <code className="font-mono text-xs">propose_coverage</code> to queue
          a suggestion without writing the graph.
        </p>
      ) : (
        <ul className="space-y-3">
          {queue.map((item, index) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
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
                      <li key={`${item.id}-${i}`}>{summarizeDiff(diff)}</li>
                    ))}
                  </ul>
                  {item.inputRefs.length > 0 ? (
                    <p className="text-xs text-[color:var(--topo-muted)]">
                      Refs: {item.inputRefs.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={pending}
                    onPress={() => void review(item.id, "rejected")}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    isDisabled={pending}
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
