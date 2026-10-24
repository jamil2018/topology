export type CaseListItem = {
  id: string;
  key: string;
  title: string;
  priority: string;
  status: string;
  tags: string[];
  folder: { id: string; name: string } | null;
  intentId?: string | null;
  intent?: { id: string; key: string; title: string } | null;
};

export type CaseListSort =
  | "key"
  | "title"
  | "folder"
  | "priority"
  | "status";

export type CaseListSortDir = "asc" | "desc";

export const CASE_LIST_PAGE_SIZE = 10;

const PRIORITY_RANK: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

import {
  parseLimitParam,
  parsePageParam,
  type PaginatedList,
} from "@/lib/list-pagination";

export type CaseListFilters = {
  folderFilter?: string;
  search?: string;
  statusFilter?: string;
  priorityFilter?: string;
};

export type CaseListQuery = CaseListFilters & {
  /** Alias for folderFilter when the caller still passes a folder UUID. */
  folderId?: string | null;
  sort?: CaseListSort;
  dir?: CaseListSortDir;
  page?: number;
  limit?: number;
  cursor?: string | null;
  /** Return every matching row (CSV export, pickers). */
  all?: boolean;
};

const CASE_SORTS = new Set<CaseListSort>([
  "key",
  "title",
  "folder",
  "priority",
  "status",
]);

export function parseCaseListSort(value: string | null | undefined): CaseListSort {
  if (value && CASE_SORTS.has(value as CaseListSort)) return value as CaseListSort;
  return "key";
}

export function parseCaseListSortDir(
  value: string | null | undefined,
): CaseListSortDir {
  return value === "desc" ? "desc" : "asc";
}

/** Map UI / API query-string params onto the server listCases query. */
export function caseListQueryFromSearchParams(
  params: URLSearchParams,
): CaseListQuery {
  const folder =
    params.get("folder") ?? params.get("folderId") ?? "all";
  return {
    folderFilter: folder || "all",
    search: params.get("q") ?? params.get("search") ?? "",
    statusFilter: params.get("status") ?? "all",
    priorityFilter: params.get("priority") ?? "all",
    sort: parseCaseListSort(params.get("sort")),
    dir: parseCaseListSortDir(params.get("dir")),
    page: parsePageParam(params.get("page")),
    limit: parseLimitParam(params.get("limit"), CASE_LIST_PAGE_SIZE),
    cursor: params.get("cursor"),
  };
}

export type CaseListPage<T> = PaginatedList<T>;

export function filterCases(
  cases: CaseListItem[],
  folderFilter: string,
  search: string,
  statusFilter: string = "all",
  priorityFilter: string = "all",
): CaseListItem[] {
  const q = search.trim().toLowerCase();
  return cases.filter((c) => {
    if (folderFilter === "unfiled") {
      if (c.folder) return false;
    } else if (
      folderFilter !== "all" &&
      (c.folder?.id ?? "") !== folderFilter
    ) {
      return false;
    }
    if (statusFilter !== "all" && c.status !== statusFilter) {
      return false;
    }
    if (priorityFilter !== "all" && c.priority !== priorityFilter) {
      return false;
    }
    if (!q) return true;
    const hay = [
      c.title,
      c.key,
      c.id,
      c.priority,
      c.status,
      c.folder?.name ?? "",
      ...(c.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function sortCases(
  cases: CaseListItem[],
  sort: CaseListSort,
  dir: CaseListSortDir = "asc",
): CaseListItem[] {
  const copy = [...cases];
  const sign = dir === "asc" ? 1 : -1;
  copy.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "key":
        cmp = a.key.localeCompare(b.key);
        break;
      case "folder":
        cmp = (a.folder?.name ?? "").localeCompare(b.folder?.name ?? "");
        if (!cmp) cmp = a.key.localeCompare(b.key);
        break;
      case "priority":
        cmp =
          (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
        if (!cmp) cmp = a.key.localeCompare(b.key);
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        if (!cmp) cmp = a.key.localeCompare(b.key);
        break;
      case "title":
      default:
        cmp = a.title.localeCompare(b.title);
        if (!cmp) cmp = a.key.localeCompare(b.key);
        break;
    }
    return cmp * sign;
  });
  return copy;
}

export function filterAndSortCases(
  cases: CaseListItem[],
  folderFilter: string,
  search: string,
  sort: CaseListSort,
  dir: CaseListSortDir = "asc",
  statusFilter: string = "all",
  priorityFilter: string = "all",
): CaseListItem[] {
  return sortCases(
    filterCases(cases, folderFilter, search, statusFilter, priorityFilter),
    sort,
    dir,
  );
}

export function paginateCases<T>(
  items: T[],
  page: number,
  pageSize: number = CASE_LIST_PAGE_SIZE,
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
