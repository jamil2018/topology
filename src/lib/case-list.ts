export type CaseListItem = {
  id: string;
  key: string;
  title: string;
  priority: string;
  status: string;
  tags: string[];
  folder: { id: string; name: string } | null;
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

export type CaseListFilters = {
  folderFilter?: string;
  search?: string;
  statusFilter?: string;
  priorityFilter?: string;
};

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
