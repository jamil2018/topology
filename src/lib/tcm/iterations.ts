export type DatasetRow = {
  position?: number;
  values: Record<string, string>;
};

export type Iteration = {
  index: number;
  values: Record<string, string>;
  label: string;
};

export function fanOutIterations(
  rows: readonly DatasetRow[] | null | undefined,
): Iteration[] {
  const cleaned = [...(rows ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((row) => {
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(row.values ?? {})) {
        if (!key.trim()) continue;
        values[key.trim()] = String(value ?? "");
      }
      return values;
    })
    .filter((values) => Object.keys(values).length > 0);

  if (cleaned.length === 0) {
    return [{ index: 0, values: {}, label: "" }];
  }

  return cleaned.map((values, index) => ({
    index,
    values,
    label: Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(", "),
  }));
}
