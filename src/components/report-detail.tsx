"use client";

import Link from "next/link";
import { PlayIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";
import {
  CumulativeTimeline,
  PeerRunTrend,
  StatusDonut,
  SuiteBars,
} from "./report-charts";
import { formatDuration, type ReportKpis, type SuiteBreakdownRow, type TimelinePoint } from "@/lib/report-stats";

export type ReportDetailModel = {
  run: {
    id: string;
    name: string;
    description: string;
    status: string;
    kind: string;
    source: string;
    environment: string;
    branch: string | null;
    commitSha: string | null;
    startedAt: string | Date | null;
    completedAt: string | Date | null;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
  kpis: ReportKpis;
  suiteBreakdown: SuiteBreakdownRow[];
  timeline: TimelinePoint[];
  failures: Array<{
    resultId: string;
    caseId: string | null;
    caseKey: string;
    title: string;
    priority: string | null;
    suite: string;
    notes: string;
    durationMs: number | null;
    executedAt: string | null;
    isFlaky: boolean;
    flakeHint: string | null;
  }>;
  trend: Array<{
    id: string;
    name: string;
    passed: number;
    failed: number;
    isCurrent?: boolean;
  }>;
};

function formatWhen(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportDetail({ report }: { report: ReportDetailModel }) {
  const reduceMotion = useReducedMotion();
  const { run, kpis, suiteBreakdown, timeline, failures, trend } = report;

  const kpiTiles = [
    {
      label: "Pass rate",
      value: kpis.passRate == null ? "n/a" : `${kpis.passRate}%`,
      hint: `${kpis.executed} executed`,
    },
    {
      label: "Passed",
      value: String(kpis.passed),
      hint: `${kpis.total} total results`,
    },
    {
      label: "Failed",
      value: String(kpis.failed),
      hint: `${kpis.blocked} blocked`,
    },
    {
      label: "Skipped",
      value: String(kpis.skipped),
      hint: `${kpis.untested} untested`,
    },
    {
      label: "Flake",
      value: String(kpis.flake),
      hint: "suspect cases in failures",
    },
    {
      label: "Duration",
      value: formatDuration(kpis.durationMs),
      hint: run.completedAt ? "wall clock" : "sum of result timings",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Report · linked run"
        title={run.name}
        description={
          run.description?.trim() ||
          "Visual report for this test run — KPIs, charts, suite breakdown, and failures."
        }
        meta={
          <>
            <StatusChip tone={statusToneForRun(run.status)}>
              {run.status.replace("_", " ")}
            </StatusChip>
            <StatusChip tone={run.kind === "automation" ? "info" : "neutral"}>
              {run.kind === "automation" ? "CI / automation" : "manual"}
            </StatusChip>
            <StatusChip tone="neutral" mono>
              {run.environment}
            </StatusChip>
            {run.branch ? (
              <StatusChip tone="accent" mono>
                {run.branch}
              </StatusChip>
            ) : null}
            {run.commitSha ? (
              <StatusChip tone="neutral" mono>
                {run.commitSha.slice(0, 7)}
              </StatusChip>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/runs/${run.id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)] transition active:scale-[0.98]"
            >
              <PlayIcon size={14} weight="bold" aria-hidden />
              Open run
            </Link>
            <Link
              href="/reports"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              All reports
            </Link>
            {kpis.failed > 0 ? (
              <Link
                href="/triage"
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
              >
                Triage
              </Link>
            ) : null}
          </div>
        }
      />

      <p className="font-mono text-[11px] text-[color:var(--topo-muted)]">
        Run {run.id.slice(0, 8)} · started {formatWhen(run.startedAt)} · finished{" "}
        {formatWhen(run.completedAt)} · source {run.source}
      </p>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-line)] sm:grid-cols-3 lg:grid-cols-6">
        {kpiTiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.03 + i * 0.02 }}
            className="bg-[color:var(--topo-panel)] px-3 py-3"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topo-muted)]">
              {tile.label}
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-[color:var(--topo-ink)]">
              {tile.value}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
              {tile.hint}
            </div>
          </motion.div>
        ))}
      </section>

      <section className="grid gap-px overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-line)] lg:grid-cols-2">
        <div className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Status breakdown
          </h2>
          <div className="mt-3">
            <StatusDonut kpis={kpis} />
          </div>
        </div>
        <div className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Pass / fail within run
          </h2>
          <div className="mt-3">
            <CumulativeTimeline points={timeline} />
          </div>
        </div>
        <div className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Suite / folder breakdown
          </h2>
          <div className="mt-3">
            <SuiteBars rows={suiteBreakdown} />
          </div>
        </div>
        <div className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Peer run trend
          </h2>
          <p className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
            Recent runs for context — current report highlighted.
          </p>
          <div className="mt-3">
            <PeerRunTrend trend={trend} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--topo-line)] px-3 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              Failures
            </h2>
            <p className="text-xs text-[color:var(--topo-muted)]">
              Triage-friendly list of failed and blocked results for this run.
            </p>
          </div>
          <StatusChip tone={failures.length ? "danger" : "success"} mono>
            {failures.length} open
          </StatusChip>
        </div>

        {failures.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-[color:var(--topo-muted)]">
            No failures in this run.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/40 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topo-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Case</th>
                  <th className="px-3 py-2 font-medium">Suite</th>
                  <th className="px-3 py-2 font-medium">Pri</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--topo-line)]">
                {failures.map((row) => (
                  <tr
                    key={row.resultId}
                    className="align-top hover:bg-[color:var(--topo-chip)]/30"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[11px] text-[color:var(--topo-accent)]">
                        {row.caseKey}
                      </div>
                      <div className="mt-0.5 max-w-xs text-[color:var(--topo-ink)]">
                        {row.title}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[color:var(--topo-muted)]">
                      {row.suite}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.priority ? (
                        <StatusChip
                          tone={row.priority === "P0" ? "danger" : "warning"}
                          mono
                        >
                          {row.priority}
                        </StatusChip>
                      ) : (
                        <span className="text-[color:var(--topo-muted)]">—</span>
                      )}
                    </td>
                    <td className="max-w-sm px-3 py-2.5 text-xs text-[color:var(--topo-muted)]">
                      {row.notes?.trim() || "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-[color:var(--topo-muted)]">
                      {formatDuration(row.durationMs)}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.isFlaky ? (
                        <StatusChip tone="warning" title={row.flakeHint ?? undefined}>
                          flake
                        </StatusChip>
                      ) : (
                        <StatusChip tone="danger">defect</StatusChip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Link
          href={`/runs/${run.id}`}
          className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
        >
          Execute / review cases
        </Link>
      </div>
    </div>
  );
}
