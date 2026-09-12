export type CaseOutcome = "passed" | "failed" | "blocked" | "skipped" | "untested";

export type MilestoneCase = {
  key: string;
  priority: "P0" | "P1" | "P2" | "P3";
  status: "draft" | "ready" | "blocked" | "deprecated";
  lastResult?: CaseOutcome | null;
};

export type MilestoneThresholds = {
  minPassRate: number;
  maxOpenP0Failures: number;
  requireReadyCases?: boolean;
};

export type ReadinessResult = {
  status: "ready" | "at_risk" | "blocked";
  score: number;
  passRate: number | null;
  openP0Failures: number;
  blockedCases: number;
  notReadyCases: number;
  reasons: string[];
};

export function computeMilestoneReadiness(
  cases: MilestoneCase[],
  thresholds: MilestoneThresholds = {
    minPassRate: 95,
    maxOpenP0Failures: 0,
    requireReadyCases: true,
  },
): ReadinessResult {
  const active = cases.filter((c) => c.status !== "deprecated");
  const withResult = active.filter(
    (c) => c.lastResult && c.lastResult !== "untested" && c.lastResult !== "skipped",
  );
  const passed = withResult.filter((c) => c.lastResult === "passed").length;
  const failed = withResult.filter((c) => c.lastResult === "failed").length;
  const executed = passed + failed;
  const passRate =
    executed === 0 ? null : Math.round((passed / executed) * 100);

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
  if (openP0Failures > thresholds.maxOpenP0Failures) {
    reasons.push(
      `${openP0Failures} open P0 failure(s) (max ${thresholds.maxOpenP0Failures})`,
    );
  }
  if (thresholds.requireReadyCases && notReadyCases > 0) {
    reasons.push(`${notReadyCases} required case(s) are not ready`);
  }
  if (blockedCases > 0) {
    reasons.push(`${blockedCases} case(s) blocked`);
  }

  let status: ReadinessResult["status"] = "ready";
  if (
    openP0Failures > thresholds.maxOpenP0Failures ||
    blockedCases > 0 ||
    (passRate != null && passRate < thresholds.minPassRate - 10)
  ) {
    status = "blocked";
  } else if (reasons.length > 0) {
    status = "at_risk";
  }

  // Score: blend pass rate with readiness completeness.
  const readinessPct =
    active.length === 0
      ? 100
      : Math.round(
          ((active.length - notReadyCases) / active.length) * 100,
        );
  const passComponent = passRate ?? (executed === 0 ? 100 : 0);
  const score = Math.round(passComponent * 0.7 + readinessPct * 0.3);

  if (reasons.length === 0) {
    reasons.push("Milestone gates are green");
  }

  return {
    status,
    score,
    passRate,
    openP0Failures,
    blockedCases,
    notReadyCases,
    reasons,
  };
}

export function readinessBadgeLabel(
  status: ReadinessResult["status"],
): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "at_risk":
      return "At risk";
    case "blocked":
      return "Blocked";
  }
}
