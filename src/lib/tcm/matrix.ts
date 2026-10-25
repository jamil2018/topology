export type PlanMatrixInput = {
  browsers?: readonly string[] | null;
  operatingSystems?: readonly string[] | null;
  environmentIds?: readonly string[] | null;
};

export type MatrixCell = {
  browser: string | null;
  os: string | null;
  environmentId: string | null;
};

function cleanAxis(values: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * Cartesian product of browser × OS × environment.
 * An empty axis contributes a single null so the product is never empty.
 */
export function fanOutMatrix(input: PlanMatrixInput): MatrixCell[] {
  const browsers = cleanAxis(input.browsers);
  const operatingSystems = cleanAxis(input.operatingSystems);
  const environmentIds = cleanAxis(input.environmentIds);

  const browserAxis = browsers.length > 0 ? browsers : [null];
  const osAxis = operatingSystems.length > 0 ? operatingSystems : [null];
  const envAxis = environmentIds.length > 0 ? environmentIds : [null];

  const cells: MatrixCell[] = [];
  for (const browser of browserAxis) {
    for (const os of osAxis) {
      for (const environmentId of envAxis) {
        cells.push({ browser, os, environmentId });
      }
    }
  }
  return cells;
}

export function matrixCellLabel(cell: MatrixCell): string {
  const parts = [cell.browser, cell.os].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "default";
}

export function parseMatrixJson(raw: string | null | undefined): PlanMatrixInput {
  if (!raw) {
    return { browsers: [], operatingSystems: [], environmentIds: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const asStrings = (value: unknown) =>
      Array.isArray(value) ? value.map((item) => String(item)) : [];
    return {
      browsers: asStrings(parsed.browsers),
      operatingSystems: asStrings(
        parsed.operatingSystems ?? parsed.oses ?? parsed.os,
      ),
      environmentIds: asStrings(parsed.environmentIds),
    };
  } catch {
    return { browsers: [], operatingSystems: [], environmentIds: [] };
  }
}

export function serializeMatrixJson(input: PlanMatrixInput): string {
  return JSON.stringify({
    browsers: cleanAxis(input.browsers),
    operatingSystems: cleanAxis(input.operatingSystems),
    environmentIds: cleanAxis(input.environmentIds),
  });
}
