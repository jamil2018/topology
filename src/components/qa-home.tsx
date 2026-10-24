"use client";

import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { formatPriorityLabel, formatStatusLabel } from "@/lib/format-labels";
import { StatusChip, statusToneForRun } from "./status-chip";
import { WidgetCard } from "./hub-widgets";
import { RunProgressBar } from "./run-progress-bar";
import type { HubPulseData, RunPulse } from "./hub-types";

function RunRow({ run }: { run: RunPulse }) {
  const passed = run.passed ?? 0;
  const failed = run.failed ?? 0;
  const skipped = run.skipped ?? 0;
  const blocked = run.blocked ?? 0;
  const untested = run.untested ?? 0;
  const total = passed + failed + skipped + blocked + untested;
  return (
    <li>
      <Link
        href={`/runs/${run.id}`}
        className="block px-4 py-2.5 text-sm transition-colors hover:bg-[color:var(--topo-chip)]/60"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium text-[color:var(--topo-ink)]">
              {run.name}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[color:var(--topo-muted)]">
              {run.kind === "automation" ? (
                <StatusChip tone="info">CI</StatusChip>
              ) : (
                <StatusChip>Manual</StatusChip>
              )}
              <span>
                {passed}P / {failed}F
                {untested > 0 ? ` · ${untested} left` : ""}
              </span>
            </div>
          </div>
          <StatusChip tone={statusToneForRun(run.status)} mono>
            {formatStatusLabel(run.status)}
          </StatusChip>
        </div>
        <RunProgressBar
          className="mt-2"
          passed={passed}
          failed={failed}
          skipped={skipped}
          blocked={blocked}
          untested={untested}
          total={total}
        />
      </Link>
    </li>
  );
}

export function QaHome({ pulse }: { pulse: HubPulseData }) {
  const reduceMotion = useReducedMotion();
  const assigned = pulse.assignedRuns ?? [];
  const inProgress = pulse.inProgressRuns ?? [];
  const failing = pulse.failingNow ?? [];
  const retest = pulse.retestQueue ?? [];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <WidgetCard reduceMotion={reduceMotion} delay={0.02} className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--topo-line)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            My assigned runs
          </h2>
          <Link
            href="/runs"
            className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)] hover:text-[color:var(--topo-accent)]"
          >
            All runs
          </Link>
        </div>
        {assigned.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--topo-muted)]">
            Nothing assigned to you. Open a planned or in-progress run and take
            it from the executor.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {assigned.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </WidgetCard>

      <WidgetCard reduceMotion={reduceMotion} delay={0.05} className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--topo-line)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            In progress
          </h2>
          <StatusChip tone={inProgress.length > 0 ? "warning" : "success"} mono>
            {inProgress.length}
          </StatusChip>
        </div>
        {inProgress.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--topo-muted)]">
            No runs in progress.{" "}
            <Link
              href="/runs/new"
              className="text-[color:var(--topo-accent)] underline-offset-2 hover:underline"
            >
              Start a run
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {inProgress.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </WidgetCard>

      <WidgetCard reduceMotion={reduceMotion} delay={0.08} className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--topo-line)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            <Link
              href="/triage"
              className="hover:text-[color:var(--topo-accent)]"
            >
              Failing now
            </Link>
          </h2>
          <StatusChip tone={failing.length > 0 ? "danger" : "success"} mono>
            {failing.length}
          </StatusChip>
        </div>
        {failing.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--topo-muted)]">
            No open triage items. Failures land here as they come in.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {failing.map((item) => (
              <li key={item.id}>
                <Link
                  href="/triage"
                  className="flex items-start justify-between gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-[color:var(--topo-chip)]/60"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[color:var(--topo-ink)]">
                      {item.caseKey ? (
                        <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                          {item.caseKey}
                        </span>
                      ) : null}
                      {item.caseKey ? (
                        <span className="text-[color:var(--topo-muted)]"> · </span>
                      ) : null}
                      {item.title}
                    </div>
                    {item.runId ? (
                      <p className="mt-0.5 font-mono text-[10px] text-[color:var(--topo-muted)]">
                        run {item.runId.slice(0, 8)}
                      </p>
                    ) : null}
                  </div>
                  <StatusChip
                    tone={item.priority === "P0" ? "danger" : "warning"}
                    mono
                  >
                    {formatPriorityLabel(item.priority)}
                  </StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </WidgetCard>

      <WidgetCard reduceMotion={reduceMotion} delay={0.1} className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--topo-line)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Retest queue
          </h2>
          <StatusChip tone={retest.length > 0 ? "warning" : "success"} mono>
            {retest.length}
          </StatusChip>
        </div>
        {retest.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--topo-muted)]">
            No cases waiting. When a linked issue closes, it appears here for
            retest.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {retest.map((item) => (
              <li key={item.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[color:var(--topo-ink)]">
                      <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                        {item.key}
                      </span>
                      {item.caseKey ? (
                        <span className="text-[color:var(--topo-muted)]">
                          {" "}
                          · {item.caseKey}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--topo-muted)]">
                      {item.title}
                    </p>
                  </div>
                  {item.runId ? (
                    <Link
                      href={`/runs/${item.runId}`}
                      className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-accent)] hover:underline"
                    >
                      Retest
                    </Link>
                  ) : (
                    <Link
                      href="/runs"
                      className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-accent)] hover:underline"
                    >
                      Start run
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </WidgetCard>
    </div>
  );
}
