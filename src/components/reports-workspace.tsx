"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, ListBox, Select } from "@heroui/react";
import { motion, useReducedMotion } from "motion/react";
import { ChartLineIcon, PlayIcon } from "@phosphor-icons/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";
import { Alert } from "./alert";
import { PassRateTrend, SuiteBars } from "./report-charts";
import { formatDuration } from "@/lib/report-stats";
import { formatStatusLabel, formatUrgencyLabel } from "@/lib/format-labels";
import {
  REPORT_RANGES,
  reportsDashboardSearch,
  type ReportRange,
  type ReportsDashboardModel,
} from "@/lib/report-dashboard";

export type ReportListItem = {
  runId: string;
  name: string;
  status: string;
  kind: string;
  source: string;
  environment: string;
  planId?: string | null;
  branch: string | null;
  commitSha: string | null;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  updatedAt: string | Date;
  createdAt: string | Date;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  untested: number;
  total: number;
  passRate: number | null;
  durationMs: number | null;
};

type KindFilter = "all" | "manual" | "automation";

const RANGE_LABELS: Record<ReportRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
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

export function ReportsWorkspace({
  reports,
  dashboard,
  loadError,
}: {
  reports: ReportListItem[];
  dashboard: ReportsDashboardModel;
  loadError?: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  function pushFilters(next: {
    range?: ReportRange;
    planId?: string | null;
    environment?: string | null;
  }) {
    const qs = reportsDashboardSearch({
      range: next.range ?? dashboard.query.range,
      planId: next.planId === undefined ? dashboard.query.planId : next.planId,
      environment:
        next.environment === undefined
          ? dashboard.query.environment
          : next.environment,
    });
    router.replace(qs ? `/reports?${qs}` : "/reports", { scroll: false });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.branch ?? "").toLowerCase().includes(q) ||
        (r.environment ?? "").toLowerCase().includes(q) ||
        (r.source ?? "").toLowerCase().includes(q)
      );
    });
  }, [reports, search, kind]);

  const { kpis } = dashboard;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Cross-run pass rate, suite health, and tester throughput. Open a completed run for the full visual report and export."
        meta={
          <>
            <StatusChip tone="accent" mono>
              {kpis.runs} runs
            </StatusChip>
            <StatusChip tone="neutral" mono>
              {RANGE_LABELS[dashboard.query.range]}
            </StatusChip>
            {kpis.passRate != null ? (
              <StatusChip tone={kpis.failed > 0 ? "warning" : "success"} mono>
                {kpis.passRate}% pass
              </StatusChip>
            ) : null}
          </>
        }
        actions={
          <Link
            href="/runs"
            className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
          >
            Open runs
          </Link>
        }
      />

      {loadError ? (
        <Alert tone="danger" title="Could not load reports">
          {loadError}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          aria-label="Date range"
          className="w-full sm:w-44"
          variant="secondary"
          value={dashboard.query.range}
          onChange={(value) => {
            if (value == null) return;
            pushFilters({ range: String(value) as ReportRange });
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {REPORT_RANGES.map((range) => (
                <ListBox.Item key={range} id={range} textValue={RANGE_LABELS[range]}>
                  {RANGE_LABELS[range]}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          aria-label="Filter by plan"
          className="w-full sm:w-52"
          variant="secondary"
          value={dashboard.query.planId ?? "all"}
          onChange={(value) => {
            if (value == null) return;
            const next = String(value);
            pushFilters({ planId: next === "all" ? null : next });
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="all" textValue="All plans">
                All plans
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {dashboard.options.plans.map((plan) => (
                <ListBox.Item key={plan.id} id={plan.id} textValue={plan.name}>
                  {plan.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          aria-label="Filter by environment"
          className="w-full sm:w-48"
          variant="secondary"
          value={dashboard.query.environment ?? "all"}
          onChange={(value) => {
            if (value == null) return;
            const next = String(value);
            pushFilters({ environment: next === "all" ? null : next });
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="all" textValue="All environments">
                All environments
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {dashboard.options.environments.map((env) => (
                <ListBox.Item key={env} id={env} textValue={env}>
                  {env}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-line)] sm:grid-cols-4">
        {[
          {
            label: "Pass rate",
            value: kpis.passRate == null ? "n/a" : `${kpis.passRate}%`,
            hint: `${kpis.executed} executed`,
          },
          {
            label: "Completed runs",
            value: String(kpis.runs),
            hint: RANGE_LABELS[dashboard.query.range],
          },
          {
            label: "Passed",
            value: String(kpis.passed),
            hint: `${kpis.failed} failed`,
          },
          {
            label: "Testers",
            value: String(dashboard.testers.length),
            hint: "with recorded results",
          },
        ].map((tile) => (
          <div key={tile.label} className="bg-[color:var(--topo-panel)] px-3 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topo-muted)]">
              {tile.label}
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-[color:var(--topo-ink)]">
              {tile.value}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
              {tile.hint}
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-px overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-line)] lg:grid-cols-2">
        <div className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Pass-rate trend
          </h2>
          <div className="mt-3">
            <PassRateTrend points={dashboard.trend} />
          </div>
        </div>
        <div className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Results by suite
          </h2>
          <div className="mt-3">
            <SuiteBars rows={dashboard.bySuite} />
          </div>
        </div>
        <div className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Release readiness
          </h2>
          {dashboard.readiness.length === 0 ? (
            <p className="mt-3 border border-dashed border-[color:var(--topo-line)] px-3 py-6 text-center text-xs text-[color:var(--topo-muted)]">
              No active milestone. Create one to gate release readiness.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[color:var(--topo-line)]">
              {dashboard.readiness.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[color:var(--topo-ink)]">
                      {row.name}
                    </div>
                    <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                      {row.reasons[0] ??
                        (row.passRate == null
                          ? "No executed results yet"
                          : `${row.passRate}% vs ${row.passRateThreshold}% gate`)}
                    </p>
                  </div>
                  <StatusChip tone={statusToneForRun(row.status)} mono>
                    {formatUrgencyLabel(row.status)}
                  </StatusChip>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-[color:var(--topo-panel)] p-3 sm:p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Tester throughput
          </h2>
          {dashboard.testers.length === 0 ? (
            <p className="mt-3 border border-dashed border-[color:var(--topo-line)] px-3 py-6 text-center text-xs text-[color:var(--topo-muted)]">
              No executed-by testers in this range.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[color:var(--topo-line)]">
              {dashboard.testers.map((tester) => (
                <li
                  key={tester.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[color:var(--topo-ink)]">
                      {tester.name}
                    </div>
                    <p className="font-mono text-[10px] text-[color:var(--topo-muted)]">
                      {tester.executed} executed · {tester.passed}P / {tester.failed}F
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-[color:var(--topo-ink)]">
                    {tester.passRate == null ? "—" : `${tester.passRate}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        <div className="border-b border-[color:var(--topo-line)] px-3 py-2.5">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Top failing cases
          </h2>
        </div>
        {dashboard.topFailing.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
            No failing cases in this range.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {dashboard.topFailing.map((row) => (
              <li key={`${row.caseId ?? row.caseKey}-${row.title}`}>
                <Link
                  href={
                    row.caseKey && row.caseKey !== "—"
                      ? `/cases/${encodeURIComponent(row.caseKey)}`
                      : "/cases"
                  }
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[color:var(--topo-chip)]/40"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[color:var(--topo-ink)]">
                      <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                        {row.caseKey}
                      </span>
                      <span className="text-[color:var(--topo-muted)]">
                        {" "}
                        · {row.title}
                      </span>
                    </div>
                  </div>
                  <StatusChip tone="danger" mono>
                    {row.failCount}F
                  </StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              Completed runs
            </h2>
            <p className="text-xs text-[color:var(--topo-muted)]">
              Drill into a run for charts, failures, and PDF/CSV export.
            </p>
          </div>
          <StatusChip tone="neutral" mono>
            {filtered.length} shown
          </StatusChip>
        </div>

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            aria-label="Search reports"
            placeholder="Search by run, branch, environment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 sm:max-w-sm"
          />
          <Select
            aria-label="Filter by run kind"
            className="w-full sm:w-44"
            variant="secondary"
            value={kind}
            onChange={(value) => {
              if (value == null) return;
              setKind(String(value) as KindFilter);
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="All kinds">
                  All kinds
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="manual" textValue="Manual">
                  Manual
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="automation" textValue="Automation / CI">
                  Automation / CI
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        {reports.length === 0 ? (
          <div className="rounded-md border border-dashed border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-14 text-center">
            <ChartLineIcon
              size={28}
              className="mx-auto text-[color:var(--topo-muted)]"
            />
            <p className="mt-3 text-sm font-medium text-[color:var(--topo-ink)]">
              No run reports yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-[color:var(--topo-muted)]">
              Reports appear after a run is completed. Finish a manual run or let
              CI mark one complete — unfinished runs stay on the Runs page until
              then.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/runs/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)]"
              >
                <PlayIcon size={14} weight="bold" aria-hidden />
                Start a run
              </Link>
              <Link
                href="/settings?section=integrations#ci"
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)]"
              >
                CI setup
              </Link>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--topo-line)] px-3 py-10 text-center text-sm text-[color:var(--topo-muted)]">
            No reports match this filter.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] divide-y divide-[color:var(--topo-line)]">
            {filtered.map((report, i) => (
              <motion.li
                key={report.runId}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : Math.min(i, 8) * 0.02 }}
              >
                <Link
                  href={`/reports/${report.runId}`}
                  className="flex flex-col gap-2 px-3 py-3 transition-colors hover:bg-[color:var(--topo-chip)]/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-[color:var(--topo-ink)]">
                        {report.name}
                      </span>
                      <StatusChip tone={statusToneForRun(report.status)}>
                        {formatStatusLabel(report.status)}
                      </StatusChip>
                      <StatusChip
                        tone={report.kind === "automation" ? "info" : "neutral"}
                      >
                        {report.kind === "automation" ? "CI" : "manual"}
                      </StatusChip>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px] text-[color:var(--topo-muted)]">
                      <span>{report.environment}</span>
                      {report.branch ? <span>{report.branch}</span> : null}
                      <span>updated {formatWhen(report.updatedAt)}</span>
                      <span>{formatDuration(report.durationMs)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <span className="font-mono text-sm tabular-nums text-[color:var(--topo-ink)]">
                      {report.passRate == null ? "—" : `${report.passRate}%`}
                    </span>
                    <StatusChip tone="success" mono>
                      {report.passed}P
                    </StatusChip>
                    <StatusChip
                      tone={report.failed > 0 ? "danger" : "neutral"}
                      mono
                    >
                      {report.failed}F
                    </StatusChip>
                    {report.skipped > 0 ? (
                      <StatusChip tone="neutral" mono>
                        {report.skipped}S
                      </StatusChip>
                    ) : null}
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
