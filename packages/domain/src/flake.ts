export type FlakeHistoryPoint = {
  status: "passed" | "failed" | "blocked" | "skipped" | "untested";
  at: Date | string;
};

export type FlakeSignal = {
  isFlaky: boolean;
  score: number;
  transitions: number;
  passCount: number;
  failCount: number;
  hint: string | null;
};

/**
 * Detect flake from alternating pass/fail outcomes in a recent window.
 * Score 0–100; >= 40 is treated as a flake suspect.
 */
export function detectFlakeSignal(
  history: FlakeHistoryPoint[],
  options: { minSamples?: number; threshold?: number } = {},
): FlakeSignal {
  const minSamples = options.minSamples ?? 4;
  const threshold = options.threshold ?? 40;

  const relevant = history
    .filter((h) => h.status === "passed" || h.status === "failed")
    .sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );

  const passCount = relevant.filter((h) => h.status === "passed").length;
  const failCount = relevant.filter((h) => h.status === "failed").length;

  if (relevant.length < minSamples) {
    return {
      isFlaky: false,
      score: 0,
      transitions: 0,
      passCount,
      failCount,
      hint: null,
    };
  }

  let transitions = 0;
  for (let i = 1; i < relevant.length; i += 1) {
    if (relevant[i].status !== relevant[i - 1].status) {
      transitions += 1;
    }
  }

  const bothOutcomes = passCount > 0 && failCount > 0;
  const transitionRate = transitions / (relevant.length - 1);
  const balance =
    Math.min(passCount, failCount) / Math.max(passCount, failCount);

  const score = bothOutcomes
    ? Math.round(Math.min(100, transitionRate * 70 + balance * 40))
    : 0;

  const isFlaky = score >= threshold;

  let hint: string | null = null;
  if (isFlaky) {
    hint = `Flake suspect: ${transitions} pass/fail flip(s) across ${relevant.length} runs (${passCount} pass / ${failCount} fail)`;
  } else if (failCount > 0 && passCount === 0) {
    hint = "Consistently failing — treat as a real defect";
  }

  return {
    isFlaky,
    score,
    transitions,
    passCount,
    failCount,
    hint,
  };
}

export function flakeBadgeLabel(signal: FlakeSignal): string | null {
  if (!signal.isFlaky) return null;
  if (signal.score >= 70) return "High flake";
  if (signal.score >= 40) return "Flake suspect";
  return null;
}
