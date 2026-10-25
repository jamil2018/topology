export type ImportStep = {
  action: string;
  expected?: string;
  data?: string;
};

export function formatSteps(steps: ImportStep[]): {
  steps: string;
  expectedResult: string;
} {
  const actions: string[] = [];
  const expected: string[] = [];
  steps.forEach((step, idx) => {
    const n = idx + 1;
    const action = [step.action.trim(), step.data?.trim()]
      .filter(Boolean)
      .join(" — ");
    if (action) actions.push(`${n}. ${action}`);
    const exp = step.expected?.trim() ?? "";
    if (exp) expected.push(`${n}. ${exp}`);
  });
  return {
    steps: actions.join("\n"),
    expectedResult: expected.join("\n"),
  };
}

function firstFilled(
  row: Record<string, string>,
  keys: string[],
): { key: string; value: string } | null {
  for (const key of keys) {
    const match = Object.keys(row).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
    if (!match) continue;
    const value = row[match]?.trim() ?? "";
    if (value) return { key: match, value };
  }
  return null;
}

/**
 * Collapse vendor CSVs that emit one row per step. A blank group key continues
 * the previous case; a repeated key appends another step.
 */
export function mergeStepRows(
  rows: Record<string, string>[],
  options: {
    groupKeys: string[];
    stepKeys: string[];
    expectedKeys?: string[];
    dataKeys?: string[];
  },
): Record<string, string>[] {
  const merged: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  let stepCount = 0;

  const pick = (row: Record<string, string>, keys: string[] | undefined) => {
    if (!keys?.length) return "";
    return firstFilled(row, keys)?.value ?? "";
  };

  const appendStep = (row: Record<string, string>) => {
    if (!current) return;
    const action = pick(row, options.stepKeys);
    const expected = pick(row, options.expectedKeys);
    const data = pick(row, options.dataKeys);
    if (!action && !expected && !data) return;
    stepCount += 1;
    const actionLine = [action, data].filter(Boolean).join(" — ");
    const steps = current.steps ? `${current.steps}\n` : "";
    const expectedSoFar = current.expectedResult
      ? `${current.expectedResult}\n`
      : "";
    if (actionLine) current.steps = `${steps}${stepCount}. ${actionLine}`;
    if (expected) {
      current.expectedResult = `${expectedSoFar}${stepCount}. ${expected}`;
    }
  };

  for (const row of rows) {
    const group = firstFilled(row, options.groupKeys);
    const continuation =
      !group || (current && group.value === (current.__group ?? ""));
    if (!current || !continuation) {
      if (current) {
        delete current.__group;
        merged.push(current);
      }
      current = { ...row, steps: "", expectedResult: "" };
      current.__group = group?.value ?? "";
      stepCount = 0;
      appendStep(row);
      continue;
    }
    appendStep(row);
  }
  if (current) {
    delete current.__group;
    merged.push(current);
  }
  return merged;
}

export function uniqueFields(
  rows: Record<string, string>[],
  extra: string[] = [],
): string[] {
  const present = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) present.add(key);
  }
  const seen = new Set<string>();
  const fields: string[] = [];
  const add = (name: string) => {
    if (!name || seen.has(name) || !present.has(name)) return;
    seen.add(name);
    fields.push(name);
  };
  extra.forEach(add);
  for (const name of present) add(name);
  return fields;
}
