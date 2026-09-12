"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { motion } from "motion/react";

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
            Manual run
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--topo-ink)]">
            {run.name}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--topo-muted)]">
            {run.description || "No description"} · {run.status.replace("_", " ")}
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-[color:var(--topo-muted)]">
          <span>
            Progress {done}/{run.results.length}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[color:var(--topo-line)]">
          <motion.div
            className="h-full bg-[color:var(--topo-accent)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="space-y-3">
        {run.results.map((result, i) => (
          <motion.article
            key={result.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-[color:var(--topo-accent)]">
                  {result.case.key}
                </div>
                <h2 className="text-base font-medium text-[color:var(--topo-ink)]">
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
                    className={`rounded-md px-2 py-1 text-xs capitalize ${
                      result.status === status
                        ? "bg-[color:var(--topo-ink)] text-[color:var(--topo-paper)]"
                        : "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            {result.case.steps ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[color:var(--topo-paper)]/70 p-3 text-xs text-[color:var(--topo-muted)]">
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
                      className="w-36 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs"
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
