/** Pure aggregations for run-linked test reports (no DB). */

export type ResultStatus =
  | "untested"
  | "passed"
  | "failed"
  | "blocked"
  | "skipped";

export type ReportResultInput = {
  id: string;
  status: ResultStatus | string;
  notes?: string | null;
  durationMs?: number | null;
  executedAt?: Date | string | null;
  createdAt?: Date | string | null;
  classname?: string | null;
  title?: string | null;
  externalKey?: string | null;
  caseId?: string | null;
  case?: {
    id: string;
    key: string;
    title: string;
    priority?: string | null;
    folder?: { id: string; name: string } | null;
  } | null;
};

export type StatusCounts = {
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  untested: number;
  total: number;
};

export type ReportKpis = StatusCounts & {
  flake: number;
  passRate: number | null;
  durationMs: number | null;
  executed: number;
};

export type SuiteBreakdownRow = {
  key: string;
  label: string;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  untested: number;
  total: number;
  passRate: number | null;
};

export type TimelinePoint = {
  at: string;
  passed: number;
  failed: number;
  cumulativePassed: number;
  cumulativeFailed: number;
};

export type FailureRow = {
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
};

function emptyCounts(): StatusCounts {
  return {
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    untested: 0,
    total: 0,
  };
}

export function countStatuses(
  results: Array<{ status: string }>,
): StatusCounts {
  const counts = emptyCounts();
  for (const r of results) {
    counts.total += 1;
    switch (r.status) {
      case "passed":
        counts.passed += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "skipped":
        counts.skipped += 1;
        break;
      case "blocked":
        counts.blocked += 1;
        break;
      default:
        counts.untested += 1;
        break;
    }
  }
  return counts;
}

export function computePassRate(passed: number, failed: number): number | null {
  const executed = passed + failed;
  if (executed === 0) return null;
  return Math.round((passed / executed) * 100);
}

export function sumDurations(
  results: Array<{ durationMs?: number | null }>,
): number | null {
  let sum = 0;
  let any = false;
  for (const r of results) {
    if (typeof r.durationMs === "number" && Number.isFinite(r.durationMs)) {
      sum += r.durationMs;
      any = true;
    }
  }
  return any ? sum : null;
}

export function runWallDurationMs(
  startedAt?: Date | string | null,
  completedAt?: Date | string | null,
): number | null {
  if (!startedAt || !completedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return end - start;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}m ${rem}s`;
}

export function suiteKeyForResult(result: ReportResultInput): {
  key: string;
  label: string;
} {
  const folder = result.case?.folder;
  if (folder?.name) {
    return { key: `folder:${folder.id}`, label: folder.name };
  }
  if (result.classname?.trim()) {
    return { key: `class:${result.classname}`, label: result.classname };
  }
  return { key: "suite:unfiled", label: "Unfiled" };
}

export function buildSuiteBreakdown(
  results: ReportResultInput[],
): SuiteBreakdownRow[] {
  const map = new Map<string, SuiteBreakdownRow>();
  for (const result of results) {
    const { key, label } = suiteKeyForResult(result);
    const row = map.get(key) ?? {
      key,
      label,
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      untested: 0,
      total: 0,
      passRate: null,
    };
    row.total += 1;
    switch (result.status) {
      case "passed":
        row.passed += 1;
        break;
      case "failed":
        row.failed += 1;
        break;
      case "skipped":
        row.skipped += 1;
        break;
      case "blocked":
        row.blocked += 1;
        break;
      default:
        row.untested += 1;
        break;
    }
    row.passRate = computePassRate(row.passed, row.failed);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => {
    if (b.failed !== a.failed) return b.failed - a.failed;
    return a.label.localeCompare(b.label);
  });
}

/** Cumulative pass/fail over execution order within a single run. */
export function buildResultTimeline(
  results: ReportResultInput[],
): TimelinePoint[] {
  const dated = results
    .filter((r) => r.status === "passed" || r.status === "failed")
    .map((r) => ({
      status: r.status as "passed" | "failed",
      at: new Date(r.executedAt ?? r.createdAt ?? 0),
    }))
    .filter((r) => Number.isFinite(r.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  let cumulativePassed = 0;
  let cumulativeFailed = 0;
  const points: TimelinePoint[] = [];

  for (const row of dated) {
    if (row.status === "passed") cumulativePassed += 1;
    else cumulativeFailed += 1;
    points.push({
      at: row.at.toISOString(),
      passed: row.status === "passed" ? 1 : 0,
      failed: row.status === "failed" ? 1 : 0,
      cumulativePassed,
      cumulativeFailed,
    });
  }
  return points;
}

export function buildReportKpis(
  results: ReportResultInput[],
  options: {
    flake?: number;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
  } = {},
): ReportKpis {
  const counts = countStatuses(results);
  const executed = counts.passed + counts.failed;
  const resultDuration = sumDurations(results);
  const wall = runWallDurationMs(options.startedAt, options.completedAt);
  return {
    ...counts,
    flake: options.flake ?? 0,
    executed,
    passRate: computePassRate(counts.passed, counts.failed),
    durationMs: wall ?? resultDuration,
  };
}

export function failureRowsFromResults(
  results: ReportResultInput[],
  flakeByCaseId: Map<string, { isFlaky: boolean; hint: string | null }> = new Map(),
): FailureRow[] {
  return results
    .filter((r) => r.status === "failed" || r.status === "blocked")
    .map((r) => {
      const caseId = r.case?.id ?? r.caseId ?? null;
      const flake = caseId ? flakeByCaseId.get(caseId) : undefined;
      const suite = suiteKeyForResult(r).label;
      return {
        resultId: r.id,
        caseId,
        caseKey: r.case?.key ?? r.externalKey ?? "—",
        title: r.case?.title ?? r.title ?? "Untitled",
        priority: r.case?.priority ?? null,
        suite,
        notes: r.notes ?? "",
        durationMs: r.durationMs ?? null,
        executedAt: r.executedAt
          ? new Date(r.executedAt).toISOString()
          : r.createdAt
            ? new Date(r.createdAt).toISOString()
            : null,
        isFlaky: flake?.isFlaky ?? false,
        flakeHint: flake?.hint ?? null,
      };
    })
    .sort((a, b) => {
      if (a.isFlaky !== b.isFlaky) return a.isFlaky ? 1 : -1;
      const pa = a.priority ?? "P9";
      const pb = b.priority ?? "P9";
      if (pa !== pb) return pa.localeCompare(pb);
      return a.caseKey.localeCompare(b.caseKey);
    });
}

/** SVG arc helpers for status donut. */
export function donutSegments(
  counts: Pick<
    StatusCounts,
    "passed" | "failed" | "skipped" | "blocked" | "untested"
  >,
): Array<{ key: string; value: number; color: string; start: number; end: number }> {
  const entries: Array<{ key: string; value: number; color: string }> = [
    { key: "passed", value: counts.passed, color: "rgb(16 185 129 / 0.85)" },
    { key: "failed", value: counts.failed, color: "rgb(239 68 68 / 0.85)" },
    { key: "blocked", value: counts.blocked, color: "rgb(245 158 11 / 0.85)" },
    { key: "skipped", value: counts.skipped, color: "rgb(113 113 122 / 0.7)" },
    { key: "untested", value: counts.untested, color: "rgb(63 63 70 / 0.9)" },
  ].filter((e) => e.value > 0);

  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total === 0) return [];

  let cursor = -Math.PI / 2;
  return entries.map((e) => {
    const sweep = (e.value / total) * Math.PI * 2;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    return { ...e, start, end };
  });
}

export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angle: number,
): { x: number; y: number } {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

export function describeDonutArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
): string {
  const large = end - start > Math.PI ? 1 : 0;
  const o1 = polarToCartesian(cx, cy, rOuter, start);
  const o2 = polarToCartesian(cx, cy, rOuter, end);
  const i1 = polarToCartesian(cx, cy, rInner, end);
  const i2 = polarToCartesian(cx, cy, rInner, start);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    "Z",
  ].join(" ");
}
