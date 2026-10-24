import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { cases, folders, testIntents } from "@/db/schema";
import {
  CASE_LIST_PAGE_SIZE,
  parseCaseListSort,
  parseCaseListSortDir,
  type CaseListQuery,
  type CaseListSort,
  type CaseListSortDir,
} from "@/lib/case-list";
import {
  buildPaginatedList,
  containsPattern,
  resolveListPagination,
  type PaginatedList,
} from "@/lib/list-pagination";
import { isUuid } from "@/lib/queries/ids";

export type ListedCase = typeof cases.$inferSelect & {
  folder: typeof folders.$inferSelect | null;
  intent: typeof testIntents.$inferSelect | null;
};

const PRIORITY_RANK_SQL = sql`case ${cases.priority}
  when 'P0' then 0
  when 'P1' then 1
  when 'P2' then 2
  when 'P3' then 3
  else 99
end`;

function folderFilterSql(folderFilter: string | undefined): SQL | undefined {
  if (!folderFilter || folderFilter === "all") return undefined;
  if (folderFilter === "unfiled") return isNull(cases.folderId);
  if (isUuid(folderFilter)) return eq(cases.folderId, folderFilter);
  return undefined;
}

function caseSearchSql(search: string | undefined): SQL | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  const pattern = containsPattern(q);
  return or(
    ilike(cases.title, pattern),
    ilike(cases.key, pattern),
    sql`${cases.id}::text ilike ${pattern} escape '\\'`,
    sql`${cases.priority}::text ilike ${pattern} escape '\\'`,
    sql`${cases.status}::text ilike ${pattern} escape '\\'`,
    ilike(folders.name, pattern),
    sql`coalesce(array_to_string(${cases.tags}, ' '), '') ilike ${pattern} escape '\\'`,
  );
}

function caseWhere(
  workspaceId: string,
  query: CaseListQuery,
): SQL | undefined {
  return and(
    eq(cases.workspaceId, workspaceId),
    folderFilterSql(query.folderFilter),
    query.statusFilter && query.statusFilter !== "all"
      ? eq(cases.status, query.statusFilter as typeof cases.$inferSelect.status)
      : undefined,
    query.priorityFilter && query.priorityFilter !== "all"
      ? eq(
          cases.priority,
          query.priorityFilter as typeof cases.$inferSelect.priority,
        )
      : undefined,
    caseSearchSql(query.search),
  );
}

function caseOrderBy(sort: CaseListSort, dir: CaseListSortDir) {
  const tieKey = dir === "desc" ? desc(cases.key) : asc(cases.key);
  const tieId = dir === "desc" ? desc(cases.id) : asc(cases.id);
  switch (sort) {
    case "title":
      return [dir === "desc" ? desc(cases.title) : asc(cases.title), tieKey, tieId];
    case "folder":
      return [
        dir === "desc" ? desc(folders.name) : asc(folders.name),
        tieKey,
        tieId,
      ];
    case "priority":
      return [
        dir === "desc" ? desc(PRIORITY_RANK_SQL) : asc(PRIORITY_RANK_SQL),
        tieKey,
        tieId,
      ];
    case "status":
      return [
        dir === "desc" ? desc(cases.status) : asc(cases.status),
        tieKey,
        tieId,
      ];
    case "key":
    default:
      return [dir === "desc" ? desc(cases.key) : asc(cases.key), tieId];
  }
}

function caseSortColumn(sort: CaseListSort) {
  switch (sort) {
    case "title":
      return cases.title;
    case "folder":
      return sql`coalesce(${folders.name}, '')`;
    case "priority":
      return sql`${PRIORITY_RANK_SQL}::text`;
    case "status":
      return cases.status;
    case "key":
    default:
      return cases.key;
  }
}

function caseSortValue(
  row: ListedCase,
  sort: CaseListSort,
): string {
  switch (sort) {
    case "title":
      return row.title;
    case "folder":
      return row.folder?.name ?? "";
    case "priority":
      return String({ P0: 0, P1: 1, P2: 2, P3: 3 }[row.priority] ?? 99);
    case "status":
      return row.status;
    case "key":
    default:
      return row.key;
  }
}

function cursorWhere(
  sort: CaseListSort,
  dir: CaseListSortDir,
  cursor: { sortValue: string; id: string },
): SQL | undefined {
  const column = caseSortColumn(sort);
  if (dir === "asc") {
    return or(
      sql`${column} > ${cursor.sortValue}`,
      and(sql`${column} = ${cursor.sortValue}`, gt(cases.id, cursor.id)),
    );
  }
  return or(
    sql`${column} < ${cursor.sortValue}`,
    and(sql`${column} = ${cursor.sortValue}`, lt(cases.id, cursor.id)),
  );
}

function mapCaseRow(row: {
  case: typeof cases.$inferSelect;
  folder: typeof folders.$inferSelect | null;
  intent: typeof testIntents.$inferSelect | null;
}): ListedCase {
  return { ...row.case, folder: row.folder, intent: row.intent };
}

export async function listCasesPage(
  workspaceId: string,
  query: CaseListQuery = {},
): Promise<PaginatedList<ListedCase>> {
  const sort = parseCaseListSort(query.sort);
  const dir = parseCaseListSortDir(query.dir);
  const paging = resolveListPagination({
    page: query.page,
    limit: query.limit,
    cursor: query.cursor,
    defaultLimit: CASE_LIST_PAGE_SIZE,
  });
  const where = and(
    caseWhere(workspaceId, query),
    paging.useCursor && paging.cursor
      ? cursorWhere(sort, dir, paging.cursor)
      : undefined,
  );

  const [totalRow] = await db
    .select({ value: count() })
    .from(cases)
    .leftJoin(folders, eq(cases.folderId, folders.id))
    .where(caseWhere(workspaceId, query));
  const total = Number(totalRow?.value ?? 0);

  const selectQuery = db
    .select({
      case: cases,
      folder: folders,
      intent: testIntents,
    })
    .from(cases)
    .leftJoin(folders, eq(cases.folderId, folders.id))
    .leftJoin(testIntents, eq(cases.intentId, testIntents.id))
    .where(where)
    .orderBy(...caseOrderBy(sort, dir));

  const rows = query.all
    ? await selectQuery
    : paging.useCursor
      ? await selectQuery.limit(paging.limit)
      : await selectQuery.limit(paging.limit).offset(paging.offset);

  const items = rows.map(mapCaseRow);
  if (query.all) {
    return buildPaginatedList(items, items.length, 1, items.length || 1, (row) =>
      caseSortValue(row, sort),
    );
  }
  return buildPaginatedList(
    items,
    total,
    paging.useCursor ? 1 : paging.page,
    paging.limit,
    (row) => caseSortValue(row, sort),
  );
}

export async function listCases(
  workspaceId: string,
  folderId?: string | null,
): Promise<ListedCase[]>;
export async function listCases(
  workspaceId: string,
  query: CaseListQuery,
): Promise<PaginatedList<ListedCase>>;
export async function listCases(
  workspaceId: string,
  folderOrQuery?: string | null | CaseListQuery,
): Promise<ListedCase[] | PaginatedList<ListedCase>> {
  const isQuery =
    folderOrQuery !== null &&
    folderOrQuery !== undefined &&
    typeof folderOrQuery === "object";
  const query: CaseListQuery = isQuery
    ? {
        ...folderOrQuery,
        folderFilter:
          folderOrQuery.folderFilter ??
          folderOrQuery.folderId ??
          undefined,
      }
    : {
        folderFilter: folderOrQuery ?? undefined,
        all: true,
      };
  const page = await listCasesPage(workspaceId, query);
  return isQuery ? page : page.items;
}
