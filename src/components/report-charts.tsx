"use client";

import Link from "next/link";
import {
  describeDonutArc,
  donutSegments,
  type ReportKpis,
  type SuiteBreakdownRow,
  type TimelinePoint,
} from "@/lib/report-stats";
import type { ReportsTrendPoint } from "@/lib/report-dashboard";

export function StatusDonut({ kpis }: { kpis: ReportKpis }) {
  const segments = donutSegments(kpis);
  const cx = 60;
  const cy = 60;
  const rOuter = 48;
  const rInner = 30;

  if (segments.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center border border-dashed border-[color:var(--topo-line)] text-xs text-[color:var(--topo-muted)]">
        No results to chart
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg
        width={120}
        height={120}
        viewBox="0 0 120 120"
        role="img"
        aria-label={`Status breakdown: ${kpis.passed} passed, ${kpis.failed} failed, ${kpis.skipped} skipped`}
        className="shrink-0"
      >
        {segments.map((seg) => (
          <path
            key={seg.key}
            d={describeDonutArc(cx, cy, rOuter, rInner, seg.start, seg.end)}
            fill={seg.color}
          />
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-[color:var(--topo-ink)]"
          style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-geist-mono)" }}
        >
          {kpis.passRate == null ? "—" : `${kpis.passRate}%`}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-[color:var(--topo-muted)]"
          style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em" }}
        >
          PASS RATE
        </text>
      </svg>
      <ul className="space-y-1.5 text-xs">
        {segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-2 capitalize text-[color:var(--topo-ink)]">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: seg.color }}
              aria-hidden
            />
            <span className="text-[color:var(--topo-muted)]">{seg.key}</span>
            <span className="font-mono tabular-nums">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SuiteBars({ rows }: { rows: SuiteBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-6 text-center text-xs text-[color:var(--topo-muted)]">
        No suite or folder breakdown for this run.
      </p>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.total));
  const top = rows.slice(0, 8);

  return (
    <div className="space-y-2.5" role="img" aria-label="Suite pass fail breakdown">
      {top.map((row) => {
        const widthPct = Math.max(8, Math.round((row.total / max) * 100));
        const executed = row.passed + row.failed;
        return (
          <div key={row.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium text-[color:var(--topo-ink)]">
                {row.label}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-[color:var(--topo-muted)]">
                {row.passed}P · {row.failed}F
                {row.passRate != null ? ` · ${row.passRate}%` : ""}
              </span>
            </div>
            <div
              className="flex h-2.5 overflow-hidden rounded-sm border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)]"
              style={{ width: `${widthPct}%` }}
            >
              {executed === 0 ? (
                <div className="h-full w-full bg-[color:var(--topo-chip)]" />
              ) : (
                <>
                  {row.passed > 0 ? (
                    <div
                      className="h-full bg-[color:var(--topo-success)]"
                      style={{ flex: row.passed }}
                    />
                  ) : null}
                  {row.failed > 0 ? (
                    <div
                      className="h-full bg-[color:var(--topo-danger)]"
                      style={{ flex: row.failed }}
                    />
                  ) : null}
                  {row.skipped + row.blocked + row.untested > 0 ? (
                    <div
                      className="h-full bg-[color:var(--topo-chip)]"
                      style={{
                        flex: row.skipped + row.blocked + row.untested,
                      }}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CumulativeTimeline({ points }: { points: TimelinePoint[] }) {
  if (points.length === 0) {
    return (
      <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-6 text-center text-xs text-[color:var(--topo-muted)]">
        No executed results yet — pass/fail timeline appears as cases finish.
      </p>
    );
  }

  const w = 320;
  const h = 120;
  const pad = 12;
  const maxY = Math.max(
    1,
    ...points.map((p) => p.cumulativePassed + p.cumulativeFailed),
  );

  function xAt(i: number) {
    if (points.length === 1) return w / 2;
    return pad + (i / (points.length - 1)) * (w - pad * 2);
  }
  function yAt(v: number) {
    return h - pad - (v / maxY) * (h - pad * 2);
  }

  const passLine = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.cumulativePassed)}`)
    .join(" ");
  const failLine = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.cumulativeFailed)}`,
    )
    .join(" ");

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-[color:var(--topo-success)]" /> Pass cumulative
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-[color:var(--topo-danger)]" /> Fail cumulative
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-32 w-full"
        role="img"
        aria-label="Cumulative pass and fail over the run"
      >
        <line
          x1={pad}
          y1={h - pad}
          x2={w - pad}
          y2={h - pad}
          stroke="var(--topo-line)"
          strokeWidth={1}
        />
        <path d={passLine} fill="none" stroke="var(--topo-success)" strokeWidth={2} />
        <path d={failLine} fill="none" stroke="var(--topo-danger)" strokeWidth={2} />
        {points.map((p, i) => (
          <g key={p.at + i}>
            <circle
              cx={xAt(i)}
              cy={yAt(p.cumulativePassed)}
              r={2.5}
              fill="var(--topo-success)"
            />
            <circle
              cx={xAt(i)}
              cy={yAt(p.cumulativeFailed)}
              r={2.5}
              fill="var(--topo-danger)"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function PeerRunTrend({
  trend,
}: {
  trend: Array<{
    id: string;
    name: string;
    passed: number;
    failed: number;
    isCurrent?: boolean;
  }>;
}) {
  const bars = [...trend].reverse();
  const max = Math.max(1, ...bars.map((r) => r.passed + r.failed));
  const chartHeight = 96;

  if (bars.length === 0) {
    return (
      <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-6 text-center text-xs text-[color:var(--topo-muted)]">
        No peer runs to compare yet.
      </p>
    );
  }

  return (
    <div
      className="flex items-end gap-1.5"
      style={{ height: chartHeight }}
      role="img"
      aria-label="Pass versus fail across recent runs"
    >
      {bars.map((run) => {
        const executed = run.passed + run.failed;
        const barPx =
          executed === 0
            ? 10
            : Math.max(14, Math.round((executed / max) * (chartHeight - 16)));
        return (
          <Link
            key={run.id}
            href={`/reports/${run.id}`}
            title={`${run.name}: ${run.passed} pass · ${run.failed} fail`}
            className={`group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 ${
              run.isCurrent ? "opacity-100" : "opacity-80 hover:opacity-100"
            }`}
          >
            <div
              className={`flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-sm border bg-[color:var(--topo-surface)] ${
                run.isCurrent
                  ? "border-[color:var(--topo-accent)]"
                  : "border-[color:var(--topo-line)]"
              }`}
              style={{ height: barPx }}
            >
              {executed === 0 ? (
                <div className="h-full w-full bg-[color:var(--topo-chip)]" />
              ) : (
                <>
                  {run.passed > 0 ? (
                    <div
                      className="w-full min-h-[2px] bg-[color:var(--topo-success)]"
                      style={{ flex: run.passed }}
                    />
                  ) : null}
                  {run.failed > 0 ? (
                    <div
                      className="w-full min-h-[2px] bg-[color:var(--topo-danger)]"
                      style={{ flex: run.failed }}
                    />
                  ) : null}
                </>
              )}
            </div>
            <span
              className={`w-full truncate text-center font-mono text-[9px] leading-none ${
                run.isCurrent
                  ? "text-[color:var(--topo-accent)]"
                  : "text-[color:var(--topo-muted)]"
              }`}
            >
              {run.name.slice(0, 5)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function PassRateTrend({ points }: { points: ReportsTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-6 text-center text-xs text-[color:var(--topo-muted)]">
        No completed-run results in this range.
      </p>
    );
  }

  const w = 360;
  const h = 128;
  const pad = 16;
  const rates = points.map((p) => p.passRate ?? 0);

  function xAt(i: number) {
    if (points.length === 1) return w / 2;
    return pad + (i / (points.length - 1)) * (w - pad * 2);
  }
  function yAt(rate: number) {
    return h - pad - (rate / 100) * (h - pad * 2);
  }

  const line = rates
    .map((rate, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(rate)}`)
    .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-32 w-full"
        role="img"
        aria-label="Pass-rate trend over time"
      >
        <line
          x1={pad}
          y1={h - pad}
          x2={w - pad}
          y2={h - pad}
          stroke="var(--topo-line)"
          strokeWidth={1}
        />
        <path d={line} fill="none" stroke="var(--topo-success)" strokeWidth={2} />
        {points.map((point, i) => (
          <circle
            key={point.date}
            cx={xAt(i)}
            cy={yAt(point.passRate ?? 0)}
            r={2.5}
            fill="var(--topo-success)"
          >
            <title>
              {point.date}:{" "}
              {point.passRate == null ? "n/a" : `${point.passRate}%`}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[color:var(--topo-muted)]">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}
