export type PickerCase = {
  id: string;
  key: string;
  title: string;
  priority: string;
  status: string;
  tags: string[];
  folder: { id: string; name: string } | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type CasePickerFilters = {
  search: string;
  status: string; // "all" | draft|ready|blocked|deprecated
  priority: string; // "all" | P0–P3
  folderId: string; // "all" | uuid
  tag: string; // "all" | tag value
};

export type CasePickerSort =
  | "title"
  | "priority"
  | "status"
  | "updated"
  | "created";

const PRIORITY_RANK: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function toTime(value: string | Date | undefined): number {
  if (!value) return 0;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

export function defaultReadySelection(cases: PickerCase[]): string[] {
  return cases.filter((c) => c.status === "ready").map((c) => c.id);
}

export function collectCaseTags(cases: PickerCase[]): string[] {
  const tags = new Set<string>();
  for (const c of cases) {
    for (const tag of c.tags ?? []) {
      const t = tag.trim();
      if (t) tags.add(t);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function filterPickerCases(
  cases: PickerCase[],
  filters: CasePickerFilters,
): PickerCase[] {
  const q = filters.search.trim().toLowerCase();
  return cases.filter((c) => {
    if (filters.status !== "all" && c.status !== filters.status) return false;
    if (filters.priority !== "all" && c.priority !== filters.priority) {
      return false;
    }
    if (filters.folderId !== "all") {
      if ((c.folder?.id ?? "") !== filters.folderId) return false;
    }
    if (filters.tag !== "all") {
      if (!(c.tags ?? []).includes(filters.tag)) return false;
    }
    if (!q) return true;
    const hay = [
      c.title,
      c.key,
      c.id,
      ...(c.tags ?? []),
      c.folder?.name ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function sortPickerCases(
  cases: PickerCase[],
  sort: CasePickerSort,
): PickerCase[] {
  const copy = [...cases];
  copy.sort((a, b) => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
      case "priority": {
        const d =
          (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
        return d || a.title.localeCompare(b.title);
      }
      case "status":
        return a.status.localeCompare(b.status) || a.title.localeCompare(b.title);
      case "created":
        return toTime(b.createdAt) - toTime(a.createdAt);
      case "updated":
      default:
        return toTime(b.updatedAt) - toTime(a.updatedAt);
    }
  });
  return copy;
}

export function visiblePickerCases(
  cases: PickerCase[],
  filters: CasePickerFilters,
  sort: CasePickerSort,
): PickerCase[] {
  return sortPickerCases(filterPickerCases(cases, filters), sort);
}
