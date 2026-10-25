export const RESULT_STATUSES = [
  "untested",
  "passed",
  "failed",
  "blocked",
  "skipped",
] as const;

export type ResultStatus = (typeof RESULT_STATUSES)[number];

export type StepInput = {
  id?: string | null;
  position?: number;
  action: string;
  expected?: string;
  data?: string;
  sharedStepId?: string | null;
};

export type OrderedStep = {
  id: string | null;
  position: number;
  action: string;
  expected: string;
  data: string;
  sharedStepId: string | null;
};

export type SharedStepItem = {
  position?: number;
  action: string;
  expected?: string;
  data?: string;
};

/** Reindex steps to 0..n-1 in the given array order, trimming fields. */
export function orderSteps(steps: readonly StepInput[]): OrderedStep[] {
  return steps.map((step, position) => ({
    id: step.id ?? null,
    position,
    action: step.action.trim(),
    expected: (step.expected ?? "").trim(),
    data: (step.data ?? "").trim(),
    sharedStepId: step.sharedStepId ?? null,
  }));
}

/** Expand shared-step references into executable rows while keeping inline steps. */
export function expandSharedSteps(
  steps: readonly OrderedStep[],
  sharedById: Map<string, readonly SharedStepItem[]>,
): OrderedStep[] {
  const expanded: OrderedStep[] = [];
  for (const step of steps) {
    if (!step.sharedStepId) {
      expanded.push({ ...step, position: expanded.length });
      continue;
    }
    const items = sharedById.get(step.sharedStepId) ?? [];
    if (items.length === 0) {
      expanded.push({
        ...step,
        position: expanded.length,
        action: step.action || `[shared step ${step.sharedStepId}]`,
      });
      continue;
    }
    for (const item of [...items].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    )) {
      expanded.push({
        id: null,
        position: expanded.length,
        action: item.action.trim(),
        expected: (item.expected ?? "").trim(),
        data: (item.data ?? "").trim(),
        sharedStepId: step.sharedStepId,
      });
    }
  }
  return expanded;
}

const PARAM_TOKEN = /\{\{\s*([A-Za-z_][\w]*)\s*\}\}|\$\{\s*([A-Za-z_][\w]*)\s*\}/g;

/** Substitute `{{name}}` / `${name}` tokens. Unknown names stay as-is. */
export function applyParameters(
  text: string,
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  return text.replace(PARAM_TOKEN, (match, braceName: string, dollarName: string) => {
    const name = braceName || dollarName;
    if (!(name in values) || values[name] == null) return match;
    return String(values[name]);
  });
}

export function applyParametersToSteps(
  steps: readonly OrderedStep[],
  values: Record<string, string | number | boolean | null | undefined>,
): OrderedStep[] {
  return steps.map((step) => ({
    ...step,
    action: applyParameters(step.action, values),
    expected: applyParameters(step.expected, values),
    data: applyParameters(step.data, values),
  }));
}

/** Project structured steps onto the legacy text columns. */
export function projectStepsToText(steps: readonly OrderedStep[]): {
  steps: string;
  expectedResult: string;
} {
  if (steps.length === 0) return { steps: "", expectedResult: "" };
  return {
    steps: steps
      .map((step, i) => `${i + 1}. ${step.action}${step.data ? ` [${step.data}]` : ""}`)
      .join("\n"),
    expectedResult: steps
      .map((step, i) => `${i + 1}. ${step.expected}`)
      .join("\n"),
  };
}

const NUMBERED = /^\s*(?:\d+[.)]|[-*])\s+(.*)$/;

function splitFallbackLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      const numbered = trimmed.match(NUMBERED);
      return (numbered ? numbered[1] : trimmed).trim();
    })
    .filter(Boolean);
}

/** Best-effort parse of legacy `steps` / `expectedResult` text. */
export function parseFallbackSteps(
  stepsText: string,
  expectedText = "",
): OrderedStep[] {
  const actions = splitFallbackLines(stepsText);
  const expected = splitFallbackLines(expectedText);
  const count = Math.max(actions.length, expected.length);
  const steps: OrderedStep[] = [];
  for (let i = 0; i < count; i += 1) {
    steps.push({
      id: null,
      position: i,
      action: actions[i] ?? "",
      expected: expected[i] ?? "",
      data: "",
      sharedStepId: null,
    });
  }
  return steps;
}

export function rollupStepStatuses(
  statuses: readonly string[],
): ResultStatus {
  if (statuses.length === 0) return "untested";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "blocked")) return "blocked";
  if (statuses.every((s) => s === "skipped")) return "skipped";
  if (statuses.every((s) => s === "passed" || s === "skipped")) return "passed";
  if (statuses.every((s) => s === "untested")) return "untested";
  return "untested";
}
