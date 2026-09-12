"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type LinkedIssue = {
  id: string;
  provider: string;
  remoteKey: string;
  url: string;
  title: string;
  remoteStatus: string;
  needsRetest: number;
};

type ResultRow = {
  id: string;
  status: string;
  notes: string;
  linkedIssues: LinkedIssue[];
  case: {
    id: string;
    key: string;
    title: string;
    steps: string;
    expectedResult: string;
  };
};

type RunDetail = {
  id: string;
  name: string;
  status: string;
  description: string;
  results: ResultRow[];
};

const statuses = ["passed", "failed", "blocked", "skipped", "untested"] as const;

function IssueChip({
  issue,
  onRefresh,
  onAckRetest,
  pending,
}: {
  issue: LinkedIssue;
  onRefresh: () => void;
  onAckRetest: () => void;
  pending: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)]/80 px-2 py-1 text-xs">
      <a
        href={issue.url}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[color:var(--topo-accent)] hover:underline"
      >
        {issue.remoteKey}
      </a>
      <span className="capitalize text-[color:var(--topo-muted)]">
        {issue.remoteStatus.replace("_", " ")}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={onRefresh}
        className="text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
      >
        Sync
      </button>
      {issue.needsRetest === 1 && issue.remoteStatus === "done" ? (
        <button
          type="button"
          disabled={pending}
          onClick={onAckRetest}
          className="rounded bg-[color:var(--topo-signal)]/15 px-1.5 py-0.5 font-medium text-[color:var(--topo-signal)]"
        >
          Retest ready
        </button>
      ) : null}
    </div>
  );
}

export function RunExecutor({ run }: { run: RunDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linkKey, setLinkKey] = useState<Record<string, string>>({});
  const done = run.results.filter((r) => r.status !== "untested").length;
  const pct =
    run.results.length === 0
      ? 0
      : Math.round((done / run.results.length) * 100);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/runs/${run.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError("Update failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function issueAction(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Issue action failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manual run"
        title={run.name}
        description={
          run.description || "No description"
        }
        meta={
          <>
            <StatusChip tone={statusToneForRun(run.status)} mono>
              {run.status.replace("_", " ")}
            </StatusChip>
            <StatusChip mono>
              {done}/{run.results.length} · {pct}%
            </StatusChip>
            <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
              {run.id.slice(0, 8)}
            </span>
          </>
        }
        actions={
          <>
            {run.status === "planned" ? (
              <Button
                size="sm"
                variant="primary"
                isDisabled={pending}
                onPress={() => void patch({ action: "start" })}
              >
                Start
              </Button>
            ) : null}
            {run.status !== "completed" ? (
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => void patch({ action: "complete" })}
              >
                Complete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="space-y-1.5">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
          <span>
            Progress {done}/{run.results.length}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-sm bg-[color:var(--topo-line)]">
          <motion.div
            className="h-full bg-[color:var(--topo-accent)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {run.results.map((result, i) => (
          <motion.article
            key={result.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.02 }}
            className="p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-[color:var(--topo-accent)]">
                  {result.case.key}
                </div>
                <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                  {result.case.title}
                </h2>
              </div>
              <div className="flex flex-wrap gap-1">
                {statuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void patch({ caseId: result.case.id, status })
                    }
                    className={`rounded-md px-2 py-1 text-xs capitalize transition active:scale-[0.98] ${
                      result.status === status
                        ? "bg-[color:var(--topo-ink)] text-[color:var(--topo-panel)]"
                        : "bg-[color:var(--topo-chip)] text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            {result.case.steps ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] p-2.5 font-mono text-[11px] text-[color:var(--topo-muted)]">
                {result.case.steps}
              </pre>
            ) : null}
            {result.case.expectedResult ? (
              <p className="mt-2 text-xs text-[color:var(--topo-muted)]">
                Expected: {result.case.expectedResult}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {result.linkedIssues.map((issue) => (
                <IssueChip
                  key={issue.id}
                  issue={issue}
                  pending={pending}
                  onRefresh={() =>
                    void issueAction({ action: "refresh", issueId: issue.id })
                  }
                  onAckRetest={() =>
                    void issueAction({
                      action: "ack_retest",
                      issueId: issue.id,
                    })
                  }
                />
              ))}
              {result.status === "failed" || result.status === "blocked" ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={pending}
                    onPress={() =>
                      void issueAction({
                        action: "create",
                        resultId: result.id,
                        provider: "mock",
                      })
                    }
                  >
                    Create issue
                  </Button>
                  <div className="flex items-center gap-1">
                    <input
                      value={linkKey[result.id] ?? ""}
                      onChange={(e) =>
                        setLinkKey((prev) => ({
                          ...prev,
                          [result.id]: e.target.value,
                        }))
                      }
                      placeholder="Link key (MOCK-1)"
                      className="w-36 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={pending || !(linkKey[result.id] ?? "").trim()}
                      onPress={() =>
                        void issueAction({
                          action: "link",
                          resultId: result.id,
                          remoteKey: (linkKey[result.id] ?? "").trim(),
                          provider: "mock",
                        })
                      }
                    >
                      Link
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}
