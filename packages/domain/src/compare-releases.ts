import type { CoverageDimension } from "./coverage";

/**
 * Plain snapshot of release quality metrics suitable for compare-releases.
 * Coverage dimensions mirror {@link CoverageReport} shape (pct may be null).
 */
export type ReleaseSnapshot = {
  requirement: CoverageDimension;
  risk: CoverageDimension;
  automation: CoverageDimension;
  execution: CoverageDimension;
  /** Flaky implementations / intents counted at this release. */
  flakeCount: number;
  /** Changes / intents still unverified (freshness) at this release. */
  unverifiedChanges: number;
};

export type CoverageDimensionDelta = {
  before: CoverageDimension;
  after: CoverageDimension;
  /** after.covered - before.covered */
  coveredDelta: number;
  /** after.total - before.total */
  totalDelta: number;
  /**
   * after.pct - before.pct when both pcts are non-null;
   * null when either side is N/A.
   */
  pctDelta: number | null;
};

export type CountDelta = {
  before: number;
  after: number;
  /** after - before */
  delta: number;
};

export type ReleaseComparison = {
  requirement: CoverageDimensionDelta;
  risk: CoverageDimensionDelta;
  automation: CoverageDimensionDelta;
  execution: CoverageDimensionDelta;
  flakeCount: CountDelta;
  unverifiedChanges: CountDelta;
};

function dimensionDelta(
  before: CoverageDimension,
  after: CoverageDimension,
): CoverageDimensionDelta {
  const pctDelta =
    before.pct == null || after.pct == null ? null : after.pct - before.pct;
  return {
    before: { ...before },
    after: { ...after },
    coveredDelta: after.covered - before.covered,
    totalDelta: after.total - before.total,
    pctDelta,
  };
}

function countDelta(before: number, after: number): CountDelta {
  return {
    before,
    after,
    delta: after - before,
  };
}

/**
 * Numeric deltas between two release snapshots (coverage + flake/unverified).
 * Order is before → after (e.g. 8.3 → 8.4).
 */
export function compareReleases(
  before: ReleaseSnapshot,
  after: ReleaseSnapshot,
): ReleaseComparison {
  return {
    requirement: dimensionDelta(before.requirement, after.requirement),
    risk: dimensionDelta(before.risk, after.risk),
    automation: dimensionDelta(before.automation, after.automation),
    execution: dimensionDelta(before.execution, after.execution),
    flakeCount: countDelta(before.flakeCount, after.flakeCount),
    unverifiedChanges: countDelta(
      before.unverifiedChanges,
      after.unverifiedChanges,
    ),
  };
}
