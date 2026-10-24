"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { RunPulse } from "./hub-types";

export function WidgetCard({
  children,
  className = "",
  delay = 0,
  reduceMotion,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.28 }}
      className={`rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function WidgetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
      {children}
    </div>
  );
}

export function CoverageBar({
  label,
  dimension,
  href,
}: {
  label: string;
  dimension: { covered: number; total: number; pct: number | null };
  href: string;
}) {
  const na = dimension.pct == null;
  return (
    <Link href={href} className="block rounded-sm transition hover:bg-[color:var(--topo-chip)]/40">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
          {label}
        </span>
        <span className="font-mono text-xs tabular-nums text-[color:var(--topo-ink)]">
          {na ? "n/a" : `${dimension.pct}%`}
          {!na ? (
            <span className="text-[color:var(--topo-muted)]">
              {" "}
              ({dimension.covered}/{dimension.total})
            </span>
          ) : dimension.total === 0 ? (
            <span className="text-[color:var(--topo-muted)]"> · none yet</span>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--topo-surface)]">
        <div
          className="h-full rounded-full bg-[color:var(--topo-accent)]"
          style={{ width: na ? "0%" : `${dimension.pct}%` }}
        />
      </div>
    </Link>
  );
}

export function gapLabel(kind: string) {
  if (kind === "uncovered_requirement") return "Uncovered requirement";
  if (kind === "manual_only_p0") return "P0 manual-only";
  if (kind === "never_executed") return "Never executed";
  return kind;
}

export function gapHref(key: string) {
  return `/cases?q=${encodeURIComponent(key)}`;
}

export function PassFailGraph({
  trend,
  flakeSuspects,
}: {
  trend: RunPulse[];
  flakeSuspects: number;
}) {
  const bars = trend.slice(0, 8).reverse();
  const max = Math.max(
    1,
    ...bars.map((run) => (run.passed ?? 0) + (run.failed ?? 0)),
  );
  const chartHeight = 112;

  if (bars.length === 0) {
    return (
      <p className="mt-4 border border-dashed border-[color:var(--topo-line)] px-3 py-6 text-center text-xs text-[color:var(--topo-muted)]">
        No run results yet to chart. Execute a run or ingest JUnit.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[color:var(--topo-success)]" />
          Pass
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[color:var(--topo-danger)]" />
          Fail
        </span>
        {flakeSuspects > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[color:var(--topo-signal)]" />
            Flake {flakeSuspects}
          </span>
        ) : null}
      </div>
      <div
        className="flex items-end gap-1.5 sm:gap-2"
        style={{ height: chartHeight }}
        role="img"
        aria-label="Pass versus fail counts across recent runs"
      >
        {bars.map((run) => {
          const passed = run.passed ?? 0;
          const failed = run.failed ?? 0;
          const executed = passed + failed;
          const barPx =
            executed === 0
              ? 10
              : Math.max(16, Math.round((executed / max) * (chartHeight - 18)));
          return (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              title={`${run.name}: ${passed} pass · ${failed} fail`}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-sm border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] transition group-hover:border-[color:var(--topo-accent)]/40"
                style={{ height: barPx }}
              >
                {executed === 0 ? (
                  <div className="h-full w-full bg-[color:var(--topo-chip)]" />
                ) : (
                  <>
                    {passed > 0 ? (
                      <div
                        className="w-full min-h-[3px] bg-[color:var(--topo-success)]"
                        style={{ flex: passed }}
                      />
                    ) : null}
                    {failed > 0 ? (
                      <div
                        className="w-full min-h-[3px] bg-[color:var(--topo-danger)]"
                        style={{ flex: failed }}
                      />
                    ) : null}
                  </>
                )}
              </div>
              <span className="w-full truncate text-center font-mono text-[9px] leading-none text-[color:var(--topo-muted)] group-hover:text-[color:var(--topo-accent)]">
                {run.name.slice(0, 6)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
