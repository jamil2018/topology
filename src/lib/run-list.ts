import {
  parseLimitParam,
  parsePageParam,
} from "@/lib/list-pagination";

export type RunListItem = {
  id: string;
  name: string;
  status: string;
  environment: string;
  createdAt?: string | Date;
  updatedAt: string | Date;
  passed?: number;
  failed?: number;
  skipped?: number;
  blocked?: number;
  untested?: number;
  total?: number;
  assigneeName?: string | null;
};

export function runExecutedCount(run: RunListItem): number {
  return (
    (run.passed ?? 0) +
    (run.failed ?? 0) +
    (run.skipped ?? 0) +
    (run.blocked ?? 0)
  );
}

export function runProgressPct(run: RunListItem): number | null {
  const total = run.total ?? runExecutedCount(run) + (run.untested ?? 0);
  if (!total) return null;
  return Math.round((runExecutedCount(run) / total) * 100);
}

export type RunListSort = "updated" | "created" | "name" | "status";

export const RUN_LIST_PAGE_SIZE = 10;

export type RunListQuery = {
  kind?: "manual" | "automation";
  search?: string;
  sort?: RunListSort;
  page?: number;
  limit?: number;
  cursor?: string | null;
  all?: boolean;
};

const RUN_SORTS = new Set<RunListSort>(["updated", "created", "name", "status"]);

export function parseRunListSort(value: string | null | undefined): RunListSort {
  if (value && RUN_SORTS.has(value as RunListSort)) return value as RunListSort;
  return "updated";
}

/** Map UI / API query-string params onto the server listRuns query. */
export function runListQueryFromSearchParams(
  params: URLSearchParams,
): RunListQuery {
  const kindRaw = params.get("kind");
  const kind =
    kindRaw === "manual" || kindRaw === "automation" ? kindRaw : undefined;
  return {
    kind,
    search: params.get("q") ?? params.get("search") ?? "",
    sort: parseRunListSort(params.get("sort")),
    page: parsePageParam(params.get("page")),
    limit: parseLimitParam(params.get("limit"), RUN_LIST_PAGE_SIZE),
    cursor: params.get("cursor"),
  };
}

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
