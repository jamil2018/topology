export type ReliabilityStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "skipped"
  | "untested"
  | "error";

export type ReliabilityHistoryPoint = {
  status: ReliabilityStatus;
  at: Date | string;
  browser?: string | null;
  os?: string | null;
};

export type ReliabilityDimension = "overall" | "browser" | "os";

export type ReliabilitySlice = {
  dimension: ReliabilityDimension;
  /** Normalized label: "overall", browser name, or OS name. */
  key: string;
  passCount: number;
  failCount: number;
  /** Pass + fail samples only (skipped/blocked/untested ignored). */
  sampleCount: number;
  /** 0–100, or null when sampleCount is 0. */
  passRate: number | null;
};

export type ReliabilityReport = {
  overall: ReliabilitySlice;
  byBrowser: ReliabilitySlice[];
  byOs: ReliabilitySlice[];
};

export type ReliabilityRegression = {
  dimension: ReliabilityDimension;
  key: string;
  previousPassRate: number;
  currentPassRate: number;
  /** Absolute drop in pass-rate points (previous − current). */
  dropPoints: number;
  isRegression: boolean;
};

function normalizeLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function isDecisive(status: ReliabilityStatus): status is "passed" | "failed" {
  return status === "passed" || status === "failed";
}

function emptySlice(
  dimension: ReliabilityDimension,
  key: string,
): ReliabilitySlice {
  return {
    dimension,
    key,
    passCount: 0,
    failCount: 0,
    sampleCount: 0,
    passRate: null,
  };
}

function finalizeSlice(
  dimension: ReliabilityDimension,
  key: string,
  passCount: number,
  failCount: number,
): ReliabilitySlice {
  const sampleCount = passCount + failCount;
  return {
    dimension,
    key,
    passCount,
    failCount,
    sampleCount,
    passRate:
      sampleCount === 0
        ? null
        : Math.round((passCount / sampleCount) * 1000) / 10,
  };
}

/**
 * Pass rate / reliability from execution history, sliced by browser and OS.
 * Only passed/failed counts toward rates; other statuses are ignored.
 */
export function computeReliability(
  history: ReliabilityHistoryPoint[],
): ReliabilityReport {
  let overallPass = 0;
  let overallFail = 0;
  const browsers = new Map<string, { pass: number; fail: number }>();
  const oses = new Map<string, { pass: number; fail: number }>();

  for (const point of history) {
    if (!isDecisive(point.status)) continue;

    if (point.status === "passed") overallPass += 1;
    else overallFail += 1;

    const browser = normalizeLabel(point.browser);
    if (browser) {
      const bucket = browsers.get(browser) ?? { pass: 0, fail: 0 };
      if (point.status === "passed") bucket.pass += 1;
      else bucket.fail += 1;
      browsers.set(browser, bucket);
    }

    const os = normalizeLabel(point.os);
    if (os) {
      const bucket = oses.get(os) ?? { pass: 0, fail: 0 };
      if (point.status === "passed") bucket.pass += 1;
      else bucket.fail += 1;
      oses.set(os, bucket);
    }
  }

  const byBrowser = [...browsers.entries()]
    .map(([key, counts]) =>
      finalizeSlice("browser", key, counts.pass, counts.fail),
    )
    .sort((a, b) => a.key.localeCompare(b.key));

  const byOs = [...oses.entries()]
    .map(([key, counts]) =>
      finalizeSlice("os", key, counts.pass, counts.fail),
    )
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    overall: finalizeSlice("overall", "overall", overallPass, overallFail),
    byBrowser,
    byOs,
  };
}

function sliceMap(report: ReliabilityReport): Map<string, ReliabilitySlice> {
  const map = new Map<string, ReliabilitySlice>();
  map.set(`overall::overall`, report.overall);
  for (const slice of report.byBrowser) {
    map.set(`browser::${slice.key}`, slice);
  }
  for (const slice of report.byOs) {
    map.set(`os::${slice.key}`, slice);
  }
  return map;
}

/**
 * Detect reliability regressions when a slice's pass rate drops vs a prior window.
 * Default: ≥5 point drop with at least `minSamples` decisive outcomes in both windows.
 */
export function detectReliabilityRegression(
  current: ReliabilityHistoryPoint[],
  previous: ReliabilityHistoryPoint[],
  options: { minDropPoints?: number; minSamples?: number } = {},
): ReliabilityRegression[] {
  const minDropPoints = options.minDropPoints ?? 5;
  const minSamples = options.minSamples ?? 3;

  const currentReport = computeReliability(current);
  const previousReport = computeReliability(previous);
  const currentMap = sliceMap(currentReport);
  const previousMap = sliceMap(previousReport);

  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const regressions: ReliabilityRegression[] = [];

  for (const composite of keys) {
    const [dimension, ...rest] = composite.split("::");
    const key = rest.join("::");
    if (
      dimension !== "overall" &&
      dimension !== "browser" &&
      dimension !== "os"
    ) {
      continue;
    }

    const curr =
      currentMap.get(composite) ?? emptySlice(dimension, key || "overall");
    const prev =
      previousMap.get(composite) ?? emptySlice(dimension, key || "overall");

    if (
      curr.sampleCount < minSamples ||
      prev.sampleCount < minSamples ||
      curr.passRate === null ||
      prev.passRate === null
    ) {
      continue;
    }

    const dropPoints =
      Math.round((prev.passRate - curr.passRate) * 10) / 10;
    const isRegression = dropPoints >= minDropPoints;

    if (!isRegression) continue;

    regressions.push({
      dimension,
      key: curr.key,
      previousPassRate: prev.passRate,
      currentPassRate: curr.passRate,
      dropPoints,
      isRegression: true,
    });
  }

  return regressions.sort((a, b) => b.dropPoints - a.dropPoints);
}
