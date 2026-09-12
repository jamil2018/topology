export type RunListItem = {
  id: string;
  name: string;
  status: string;
  environment: string;
  createdAt?: string | Date;
  updatedAt: string | Date;
};

export type RunListSort = "updated" | "created" | "name" | "status";

export const RUN_LIST_PAGE_SIZE = 10;
/** Show search / sort / pagination only once the list exceeds this count. */
export const RUN_LIST_CONTROLS_THRESHOLD = 10;

function toTime(value: string | Date | undefined): number {
  if (!value) return 0;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

export function filterAndSortRuns(
  runs: RunListItem[],
  search: string,
  sort: RunListSort,
): RunListItem[] {
  const q = search.trim().toLowerCase();
  const filtered = !q
    ? [...runs]
    : runs.filter((r) => {
        const hay = [r.name, r.id, r.status, r.status.replaceAll("_", " "), r.environment]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });

  filtered.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "status":
        return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
      case "created":
        return toTime(b.createdAt) - toTime(a.createdAt);
      case "updated":
      default:
        return toTime(b.updatedAt) - toTime(a.updatedAt);
    }
  });

  return filtered;
}

export function paginateRuns<T>(
  items: T[],
  page: number,
  pageSize: number = RUN_LIST_PAGE_SIZE,
): { page: number; totalPages: number; items: T[]; total: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    total,
    items: items.slice(start, start + pageSize),
  };
}
