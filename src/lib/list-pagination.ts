/** Shared cursor + page-number helpers for server-side list queries. */

export const DEFAULT_LIST_LIMIT = 10;
export const MAX_LIST_LIMIT = 100;

export type ListCursor = {
  sortValue: string;
  id: string;
};

export type PaginatedList<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  nextCursor: string | null;
};

export function encodeListCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeListCursor(
  raw: string | null | undefined,
): ListCursor | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<ListCursor>;
    if (
      typeof parsed.sortValue === "string" &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { sortValue: parsed.sortValue, id: parsed.id };
    }
  } catch {
    return null;
  }
  return null;
}

export function parsePageParam(
  value: string | number | null | undefined,
): number {
  const n =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function parseLimitParam(
  value: string | number | null | undefined,
  fallback: number = DEFAULT_LIST_LIMIT,
): number {
  const n =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(MAX_LIST_LIMIT, Math.floor(n));
}

export function pageToOffset(page: number, limit: number): number {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  return (safePage - 1) * safeLimit;
}

export function totalPagesFor(total: number, pageSize: number): number {
  const size = Math.max(1, pageSize);
  return Math.max(1, Math.ceil(Math.max(0, total) / size) || 1);
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

/**
 * Resolve limit/offset/cursor for a list query.
 * Query-string `page` wins over `cursor` so existing UI page params keep working.
 */
export function resolveListPagination(input: {
  page?: string | number | null;
  limit?: string | number | null;
  cursor?: string | null;
  defaultLimit?: number;
}): {
  page: number;
  limit: number;
  offset: number;
  cursor: ListCursor | null;
  useCursor: boolean;
} {
  const limit = parseLimitParam(input.limit, input.defaultLimit);
  const pageRaw = input.page;
  const hasPage =
    pageRaw !== undefined &&
    pageRaw !== null &&
    String(pageRaw).trim() !== "";
  const page = parsePageParam(pageRaw);
  const cursor = hasPage ? null : decodeListCursor(input.cursor);
  return {
    page: cursor ? 1 : page,
    limit,
    offset: cursor ? 0 : pageToOffset(page, limit),
    cursor,
    useCursor: cursor !== null,
  };
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): { page: number; totalPages: number; items: T[]; total: number } {
  const total = items.length;
  const totalPages = totalPagesFor(total, pageSize);
  const safePage = clampPage(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    total,
    items: items.slice(start, start + pageSize),
  };
}

export function buildPaginatedList<T extends { id: string }>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  sortValue: (item: T) => string,
): PaginatedList<T> {
  const totalPages = totalPagesFor(total, pageSize);
  const safePage = clampPage(page, totalPages);
  const last = items[items.length - 1];
  const consumed = (safePage - 1) * pageSize + items.length;
  return {
    items,
    total,
    page: safePage,
    pageSize,
    totalPages,
    nextCursor:
      last && consumed < total
        ? encodeListCursor({ sortValue: sortValue(last), id: last.id })
        : null,
  };
}

export function escapeIlikePattern(raw: string): string {
  return raw.replace(/[%_\\]/g, "\\$&");
}

export function containsPattern(raw: string): string {
  return `%${escapeIlikePattern(raw.trim())}%`;
}
