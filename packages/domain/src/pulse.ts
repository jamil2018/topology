export type PulseInput = {
  cases: {
    total: number;
    ready: number;
    blocked: number;
    draft: number;
  };
  runs: {
    total: number;
    inProgress: number;
    completed: number;
    automation?: number;
  };
  results: {
    passed: number;
    failed: number;
    untested: number;
    total: number;
  };
  triageOpen?: number;
  flakeSuspects?: number;
};

export type QualityPulse = {
  passRate: number | null;
  caseReadiness: number | null;
  activeRuns: number;
  openFailures: number;
  flakeSuspects: number;
  triageBacklog: number;
  health: "healthy" | "watch" | "critical";
  signals: string[];
};

export function computeQualityPulse(input: PulseInput): QualityPulse {
  const executed = input.results.passed + input.results.failed;
  const passRate =
    executed === 0 ? null : Math.round((input.results.passed / executed) * 100);

  const caseReadiness =
    input.cases.total === 0
      ? null
      : Math.round((input.cases.ready / input.cases.total) * 100);

  const openFailures = input.results.failed;
  const triageBacklog = input.triageOpen ?? openFailures;
  const flakeSuspects = input.flakeSuspects ?? 0;
  const activeRuns = input.runs.inProgress;

  const signals: string[] = [];
  if (passRate != null && passRate < 80) {
    signals.push(`Pass rate ${passRate}% is below 80%`);
  }
  if (input.cases.blocked > 0) {
    signals.push(`${input.cases.blocked} case(s) blocked`);
  }
  if (triageBacklog > 0) {
    signals.push(`${triageBacklog} failure(s) awaiting triage`);
  }
  if (flakeSuspects > 0) {
    signals.push(`${flakeSuspects} flake suspect(s)`);
  }
  if (activeRuns > 0) {
    signals.push(`${activeRuns} run(s) in progress`);
  }
  if (signals.length === 0) {
    signals.push("Quality pulse is steady");
  }

  let health: QualityPulse["health"] = "healthy";
  if (
    (passRate != null && passRate < 70) ||
    openFailures >= 5 ||
    input.cases.blocked >= 3
  ) {
    health = "critical";
  } else if (
    (passRate != null && passRate < 90) ||
    openFailures > 0 ||
    triageBacklog > 0 ||
    flakeSuspects > 0
  ) {
    health = "watch";
  }

  return {
    passRate,
    caseReadiness,
    activeRuns,
    openFailures,
    flakeSuspects,
    triageBacklog,
    health,
    signals,
  };
}
