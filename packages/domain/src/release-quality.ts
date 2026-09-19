/**
 * Deterministic release-scope quality summary for Hub / compare views.
 * Input is plain scope counts + gap rows (no DB).
 */

export type ReleaseQualityGap = {
  kind: string;
  id: string;
  key: string;
  title: string;
  /** Optional human reason (e.g. "lacks failure-path coverage"). */
  reason?: string;
};

export type ReleaseQualityInput = {
  /** Components touched by the release / change set. */
  affectedComponents: number;
  /** Requirements linked to the affected scope. */
  affectedRequirements: number;
  /** Intents linked to the affected scope. */
  affectedIntents: number;
  /** Intents with at least one execution in this release scope. */
  executed: number;
  passed: number;
  failed: number;
  /** Affected intents with no execution in this release scope. */
  notExecuted: number;
  gaps: ReleaseQualityGap[];
};

export type ReleaseExecutionSummary = {
  executed: number;
  passed: number;
  failed: number;
  notExecuted: number;
  /**
   * Pass rate among executed (passed + failed).
   * null when nothing was executed.
   */
  passRate: number | null;
  /**
   * Percent of affected intents that were executed.
   * null when affectedIntents is 0.
   */
  executedPct: number | null;
};

export type ReleaseQualitySummary = {
  affected: {
    components: number;
    requirements: number;
    intents: number;
  };
  execution: ReleaseExecutionSummary;
  gaps: ReleaseQualityGap[];
};

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/**
 * Summarize release-scoped quality from affected counts and execution tallies.
 * Does not invent gaps — callers supply the inspectable list.
 */
export function computeReleaseQuality(
  input: ReleaseQualityInput,
): ReleaseQualitySummary {
  const executed = Math.max(0, input.executed);
  const passed = Math.max(0, input.passed);
  const failed = Math.max(0, input.failed);
  const notExecuted = Math.max(0, input.notExecuted);
  const affectedIntents = Math.max(0, input.affectedIntents);

  return {
    affected: {
      components: Math.max(0, input.affectedComponents),
      requirements: Math.max(0, input.affectedRequirements),
      intents: affectedIntents,
    },
    execution: {
      executed,
      passed,
      failed,
      notExecuted,
      passRate: pct(passed, passed + failed),
      executedPct: pct(executed, affectedIntents),
    },
    gaps: input.gaps.map((g) => ({ ...g })),
  };
}
