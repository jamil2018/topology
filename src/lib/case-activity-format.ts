export function stringifyActivityValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.join(", ") || "(none)";
  return String(value);
}

export function describeCaseChange(
  field: string,
  fromValue: unknown,
  toValue: unknown,
): string {
  const from = stringifyActivityValue(fromValue) ?? "(empty)";
  const to = stringifyActivityValue(toValue) ?? "(empty)";
  switch (field) {
    case "folderId":
      return `Moved folder ${from} → ${to}`;
    case "tags":
      return `Tags ${from} → ${to}`;
    case "status":
      return `Status ${from} → ${to}`;
    case "priority":
      return `Priority ${from} → ${to}`;
    default:
      return `${field} ${from} → ${to}`;
  }
}
