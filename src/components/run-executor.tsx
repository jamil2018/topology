"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { motion } from "motion/react";

type ResultRow = {
  id: string;
  status: string;
  notes: string;
  case: {
    id: string;
    key: string;
    title: string;
    steps: string;
    expectedResult: string;
  } | null;
  externalKey?: string | null;
  title?: string | null;
};

type RunDetail = {
  id: string;
  name: string;
  status: string;
  description: string;
  kind: string;
  source?: string;
  results: ResultRow[];
};

const statuses = ["passed", "failed", "blocked", "skipped", "untested"] as const;

export function RunExecutor({ run }: { run: RunDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = run.results.filter((r) => r.status !== "untested").length;
  const pct =
    run.results.length === 0
      ? 0
      : Math.round((done / run.results.length) * 100);
  const isAutomation = run.kind === "automation";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
            {isAutomation ? `Automation · ${run.source ?? "ci"}` : "Manual run"}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--topo-ink)]">
            {run.name}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--topo-muted)]">
            {run.description || "No description"} · {run.status.replace("_", " ")}
          </p>
        </div>
        {!isAutomation ? (
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
        ) : null}
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
        {run.results.map((result, i) => {
          const key = result.case?.key ?? result.externalKey ?? "result";
          const title =
            result.case?.title ?? result.title ?? result.externalKey ?? "Untitled";
          return (
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
                    {key}
                  </div>
                  <h2 className="text-base font-medium text-[color:var(--topo-ink)]">
                    {title}
                  </h2>
                  <div className="mt-1 text-xs capitalize text-[color:var(--topo-muted)]">
                    {result.status}
                  </div>
                </div>
                {!isAutomation && result.case ? (
                  <div className="flex flex-wrap gap-1">
                    {statuses.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void patch({ caseId: result.case!.id, status })
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
                ) : null}
              </div>
              {result.case?.steps ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[color:var(--topo-paper)]/70 p-3 text-xs text-[color:var(--topo-muted)]">
                  {result.case.steps}
                </pre>
              ) : null}
              {result.case?.expectedResult ? (
                <p className="mt-2 text-xs text-[color:var(--topo-muted)]">
                  Expected: {result.case.expectedResult}
                </p>
              ) : null}
              {result.notes ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[color:var(--topo-paper)]/70 p-3 font-mono text-xs text-[color:var(--topo-muted)]">
                  {result.notes}
                </pre>
              ) : null}
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
