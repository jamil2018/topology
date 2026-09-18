export type CaseOutcome = "passed" | "failed" | "blocked" | "skipped" | "untested";

export type MilestoneCase = {
  key: string;
  priority: "P0" | "P1" | "P2" | "P3";
  status: "draft" | "ready" | "blocked" | "deprecated";
  lastResult?: CaseOutcome | null;
};

export type MilestoneThresholds = {
  /** Minimum pass rate among executed (passed+failed) cases. */
  minPassRate: number;
  /** Maximum open P0 failures allowed. */
  maxOpenP0Failures: number;
  /** Minimum percent of active cases that have been executed (not untested/skipped). */
  minExecutedPct: number;
  /** Maximum open blocker/critical linked issues allowed. */
  maxOpenBlockers: number;
  /** When true, draft/blocked cases count against readiness. */
  requireReadyCases?: boolean;
};

export type ReadinessInputs = {
  cases: MilestoneCase[];
  /** Open linked issues treated as release blockers (critical/P0 defects). */
  openBlockerIssues?: number;
};

export type ReadinessResult = {
  status: "go" | "at_risk" | "no_go" | "unknown";
  score: number;
  passRate: number | null;
  executedPct: number;
  openP0Failures: number;
  openBlockerIssues: number;
  blockedCases: number;
  notReadyCases: number;
  reasons: string[];
};

export const DEFAULT_MILESTONE_THRESHOLDS: MilestoneThresholds = {
  minPassRate: 95,
  maxOpenP0Failures: 0,
  minExecutedPct: 80,
  maxOpenBlockers: 0,
  requireReadyCases: true,
};

export type StampedResult = {
  caseId: string | null;
  status: string;
  executedAt: Date | string | null;
};

/**
 * Newest timestamped outcome per case. A null `executedAt` is an untested
 * placeholder and must not outrank a real execution, even if it sorts first.
 */
export function latestOutcomeByCase(
  rows: StampedResult[],
): Map<string, string> {
  const best = new Map<string, { status: string; at: number }>();
  for (const row of rows) {
    if (!row.caseId || row.executedAt == null) continue;
    const at =
      row.executedAt instanceof Date
        ? row.executedAt.getTime()
        : new Date(row.executedAt).getTime();
    if (!Number.isFinite(at)) continue;
    const prev = best.get(row.caseId);
    if (!prev || at > prev.at) {
      best.set(row.caseId, { status: row.status, at });
    }
  }
  return new Map([...best].map(([id, value]) => [id, value.status]));
}

export function computeMilestoneReadiness(
  input: MilestoneCase[] | ReadinessInputs,
  thresholds: MilestoneThresholds = DEFAULT_MILESTONE_THRESHOLDS,
): ReadinessResult {
  const cases = Array.isArray(input) ? input : input.cases;
  const openBlockerIssues = Array.isArray(input)
    ? 0
    : (input.openBlockerIssues ?? 0);

  const active = cases.filter((c) => c.status !== "deprecated");
  if (active.length === 0) {
    return {
      status: "unknown",
      score: 0,
      passRate: null,
      executedPct: 0,
      openP0Failures: 0,
      openBlockerIssues,
      blockedCases: 0,
      notReadyCases: 0,
      reasons: ["No cases in scope"],
    };
  }

  const withResult = active.filter(
    (c) => c.lastResult && c.lastResult !== "untested" && c.lastResult !== "skipped",
  );
  const passed = withResult.filter((c) => c.lastResult === "passed").length;
  const failed = withResult.filter((c) => c.lastResult === "failed").length;
  const executed = passed + failed;
  const passRate =
    executed === 0 ? null : Math.round((passed / executed) * 100);
  const executedPct = Math.round((executed / active.length) * 100);

  const openP0Failures = active.filter(
    (c) => c.priority === "P0" && c.lastResult === "failed",
  ).length;
  const blockedCases = active.filter((c) => c.status === "blocked").length;
  const notReadyCases = active.filter(
    (c) => c.status === "draft" || c.status === "blocked",
  ).length;

  const reasons: string[] = [];

  if (passRate != null && passRate < thresholds.minPassRate) {
    reasons.push(
      `Pass rate ${passRate}% is below the ${thresholds.minPassRate}% gate`,
    );
  }
  if (executedPct < thresholds.minExecutedPct) {
    reasons.push(
      `Execution progress ${executedPct}% is below the ${thresholds.minExecutedPct}% gate`,
    );
  }
  if (openP0Failures > thresholds.maxOpenP0Failures) {
    reasons.push(
      `${openP0Failures} open P0 failure(s) (max ${thresholds.maxOpenP0Failures})`,
    );
  }
  if (openBlockerIssues > thresholds.maxOpenBlockers) {
    reasons.push(
      `${openBlockerIssues} open blocker issue(s) (max ${thresholds.maxOpenBlockers})`,
    );
  }
  if (thresholds.requireReadyCases && notReadyCases > 0) {
    reasons.push(`${notReadyCases} required case(s) are not ready`);
  }
  if (blockedCases > 0) {
    reasons.push(`${blockedCases} case(s) blocked`);
  }

  let status: ReadinessResult["status"] = "go";
  const hardFail =
    openP0Failures > thresholds.maxOpenP0Failures ||
    openBlockerIssues > thresholds.maxOpenBlockers ||
    blockedCases > 0 ||
    (passRate != null && passRate < thresholds.minPassRate - 10) ||
    executedPct < Math.max(0, thresholds.minExecutedPct - 25);

  if (hardFail) {
    status = "no_go";
  } else if (reasons.length > 0) {
    status = "at_risk";
  }

  const readinessPct = Math.round(
    ((active.length - notReadyCases) / active.length) * 100,
  );
  const passComponent = passRate ?? 0;
  const score = Math.round(
    passComponent * 0.5 + executedPct * 0.3 + readinessPct * 0.2,
  );

  if (reasons.length === 0) {
    reasons.push("Milestone gates are green — Go");
  }

  return {
    status,
    score,
    passRate,
    executedPct,
    openP0Failures,
    openBlockerIssues,
    blockedCases,
    notReadyCases,
    reasons,
  };
}

export function readinessBadgeLabel(
  status: ReadinessResult["status"],
): string {
  switch (status) {
    case "go":
      return "Go";
    case "at_risk":
      return "At risk";
    case "no_go":
      return "No-Go";
    case "unknown":
      return "No data";
  }
}
