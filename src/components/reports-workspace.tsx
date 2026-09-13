"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input, ListBox, Select } from "@heroui/react";
import { motion, useReducedMotion } from "motion/react";
import { ChartLineIcon } from "@phosphor-icons/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";
import { formatDuration } from "@/lib/report-stats";

export type ReportListItem = {
  runId: string;
  name: string;
  status: string;
  kind: string;
  source: string;
  environment: string;
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
  loadError,
}: {
  reports: ReportListItem[];
  loadError?: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analytics"
        title="Test Reports"
        description="Rich visual reports linked 1:1 to test runs — KPIs, status charts, suite breakdowns, and failure triage for manual and CI runs."
        meta={
          <>
            <StatusChip tone="accent" mono>
              {reports.length} runs
            </StatusChip>
            <StatusChip tone="neutral" mono>
              {filtered.length} shown
            </StatusChip>
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
        <div
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          Could not load reports: {loadError}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
            Start a manual run or ingest CI results — each completed or in-progress
            run gets a linked report here.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/runs/new"
              className="rounded-md bg-[color:var(--topo-ink)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-panel)]"
            >
              Start a run
            </Link>
            <Link
              href="/settings?section=ci"
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
                      {report.status.replace("_", " ")}
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
  );
}
