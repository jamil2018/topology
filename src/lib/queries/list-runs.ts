import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { runResults, runs, users } from "@/db/schema";
import {
  parseRunListSort,
  RUN_LIST_PAGE_SIZE,
  type RunListQuery,
  type RunListSort,
} from "@/lib/run-list";
import {
  buildPaginatedList,
  containsPattern,
  resolveListPagination,
  type PaginatedList,
} from "@/lib/list-pagination";

export type RunListStats = {
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  untested: number;
  total: number;
  assigneeName: string | null;
};

export type ListedRun = typeof runs.$inferSelect & RunListStats;

async function attachRunListStats(
  rows: Array<typeof runs.$inferSelect>,
): Promise<ListedRun[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const assigneeIds = [
    ...new Set(
      rows
        .map((row) => row.assigneeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [countRows, assigneeRows] = await Promise.all([
    db
      .select({
        runId: runResults.runId,
        passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
        failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
        skipped: sql<number>`count(*) filter (where ${runResults.status} = 'skipped')`,
        blocked: sql<number>`count(*) filter (where ${runResults.status} = 'blocked')`,
        untested: sql<number>`count(*) filter (where ${runResults.status} = 'untested')`,
        total: count(),
      })
      .from(runResults)
      .where(inArray(runResults.runId, ids))
      .groupBy(runResults.runId),
    assigneeIds.length === 0
      ? Promise.resolve(
          [] as Array<{ id: string; name: string | null; email: string }>,
        )
      : db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, assigneeIds)),
  ]);

  const countsByRun = new Map(countRows.map((row) => [row.runId, row]));
  const nameById = new Map(
    assigneeRows.map((user) => [user.id, user.name?.trim() || user.email]),
  );

  return rows.map((row) => {
    const counts = countsByRun.get(row.id);
    return {
      ...row,
      passed: Number(counts?.passed ?? 0),
      failed: Number(counts?.failed ?? 0),
      skipped: Number(counts?.skipped ?? 0),
      blocked: Number(counts?.blocked ?? 0),
      untested: Number(counts?.untested ?? 0),
      total: Number(counts?.total ?? 0),
      assigneeName: row.assigneeId
        ? (nameById.get(row.assigneeId) ?? null)
        : null,
    };
  });
}

function runSearchSql(search: string | undefined): SQL | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  const pattern = containsPattern(q);
  const underscored = q.replaceAll("_", " ");
  const spacedPattern = containsPattern(underscored);
  return or(
    ilike(runs.name, pattern),
    sql`${runs.id}::text ilike ${pattern} escape '\\'`,
    ilike(runs.status, pattern),
    ilike(runs.environment, pattern),
    sql`replace(${runs.status}::text, '_', ' ') ilike ${spacedPattern} escape '\\'`,
  );
}

function runWhere(workspaceId: string, query: RunListQuery): SQL | undefined {
  return and(
    eq(runs.workspaceId, workspaceId),
    query.kind ? eq(runs.kind, query.kind) : undefined,
    runSearchSql(query.search),
  );
}

function runOrderBy(sort: RunListSort) {
  switch (sort) {
    case "name":
      return [asc(runs.name), asc(runs.id)];
    case "status":
      return [asc(runs.status), asc(runs.name), asc(runs.id)];
    case "created":
      return [desc(runs.createdAt), desc(runs.id)];
    case "updated":
    default:
      return [desc(runs.updatedAt), desc(runs.id)];
  }
}

function runSortColumn(sort: RunListSort) {
  switch (sort) {
    case "name":
      return runs.name;
    case "status":
      return runs.status;
    case "created":
      return runs.createdAt;
    case "updated":
    default:
      return runs.updatedAt;
  }
}

function runSortDir(sort: RunListSort): "asc" | "desc" {
  return sort === "name" || sort === "status" ? "asc" : "desc";
}

function runSortValue(
  row: typeof runs.$inferSelect,
  sort: RunListSort,
): string {
  switch (sort) {
    case "name":
      return row.name;
    case "status":
      return row.status;
    case "created":
      return new Date(row.createdAt).toISOString();
    case "updated":
    default:
      return new Date(row.updatedAt).toISOString();
  }
}

function cursorWhere(
  sort: RunListSort,
  cursor: { sortValue: string; id: string },
): SQL | undefined {
  const column = runSortColumn(sort);
  const dir = runSortDir(sort);
  const value =
    sort === "created" || sort === "updated"
      ? new Date(cursor.sortValue)
      : cursor.sortValue;
  if (dir === "asc") {
    return or(
      sql`${column} > ${value}`,
      and(sql`${column} = ${value}`, gt(runs.id, cursor.id)),
    );
  }
  return or(
    sql`${column} < ${value}`,
    and(sql`${column} = ${value}`, lt(runs.id, cursor.id)),
  );
}

export async function listRunsPage(
  workspaceId: string,
  query: RunListQuery = {},
): Promise<PaginatedList<ListedRun>> {
  const sort = parseRunListSort(query.sort);
  const paging = resolveListPagination({
    page: query.page,
    limit: query.limit,
    cursor: query.cursor,
    defaultLimit: RUN_LIST_PAGE_SIZE,
  });
  const baseWhere = runWhere(workspaceId, query);
  const where = and(
    baseWhere,
    paging.useCursor && paging.cursor
      ? cursorWhere(sort, paging.cursor)
      : undefined,
  );

  const [totalRow] = await db
    .select({ value: count() })
    .from(runs)
    .where(baseWhere);
  const total = Number(totalRow?.value ?? 0);

  const selectQuery = db
    .select()
    .from(runs)
    .where(where)
    .orderBy(...runOrderBy(sort));

  const rawItems = query.all
    ? await selectQuery
    : paging.useCursor
      ? await selectQuery.limit(paging.limit)
      : await selectQuery.limit(paging.limit).offset(paging.offset);
  const items = await attachRunListStats(rawItems);

  if (query.all) {
    return buildPaginatedList(items, items.length, 1, items.length || 1, (row) =>
      runSortValue(row, sort),
    );
  }
  return buildPaginatedList(
    items,
    total,
    paging.useCursor ? 1 : paging.page,
    paging.limit,
    (row) => runSortValue(row, sort),
  );
}

export async function listRuns(
  workspaceId: string,
  kind?: "manual" | "automation",
): Promise<ListedRun[]>;
export async function listRuns(
  workspaceId: string,
  query: RunListQuery,
): Promise<PaginatedList<ListedRun>>;
export async function listRuns(
  workspaceId: string,
  kindOrQuery?: "manual" | "automation" | RunListQuery,
): Promise<ListedRun[] | PaginatedList<ListedRun>> {
  const isQuery =
    kindOrQuery !== undefined && typeof kindOrQuery === "object";
  const query: RunListQuery = isQuery
    ? kindOrQuery
    : { kind: kindOrQuery, all: true };
  const page = await listRunsPage(workspaceId, query);
  return isQuery ? page : page.items;
}
