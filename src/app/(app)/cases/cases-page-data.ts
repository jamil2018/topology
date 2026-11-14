import { and, eq, or, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { cases } from "@/db/schema";
import { caseListQueryFromSearchParams } from "@/lib/case-list";
import { listCases, listFolders, listSavedViews } from "@/lib/queries";
import type { CaseRow, Folder } from "@/components/cases-model";
import { projectKeyPrefix } from "@/components/cases-model";
import type { SavedViewRow } from "@/components/saved-views-bar";

export type CasesWorkspaceData = {
  cases: CaseRow[];
  initialPage: import("@/lib/list-pagination").PaginatedList<CaseRow>;
  selectedCase: CaseRow | null;
  counts: { folderId: string | null; total: number }[];
  folders: Folder[];
  views: SavedViewRow[];
  projectPrefix: string;
  suggestedKey: string;
  projectSlug: string;
};

export function mapListedCase(row: {
  id: string;
  key: string;
  title: string;
  priority: string;
  status: string;
  tags: string[] | null;
  intentId?: string | null;
  folder: { id: string; name: string } | null;
  intent: { id: string; key: string; title: string } | null;
}): CaseRow {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    priority: row.priority,
    status: row.status,
    tags: row.tags ?? [],
    folder: row.folder ? { id: row.folder.id, name: row.folder.name } : null,
    intentId: row.intentId,
    intent: row.intent
      ? { id: row.intent.id, key: row.intent.key, title: row.intent.title }
      : null,
  };
}

export async function loadCasesWorkspaceData(
  workspaceId: string,
  userId: string,
  projectSlug: string,
  searchParams?: URLSearchParams,
): Promise<CasesWorkspaceData> {
  const query = caseListQueryFromSearchParams(
    searchParams ?? new URLSearchParams(),
  );
  query.limit = 50;
  const [listed, folderRows, views, counts] = await Promise.all([
    listCases(workspaceId, query),
    listFolders(workspaceId),
    listSavedViews(workspaceId, "cases", userId),
    db.select({ folderId: cases.folderId, total: count() }).from(cases).where(eq(cases.workspaceId, workspaceId)).groupBy(cases.folderId),
  ]);

  const prefix = prefixFromProjectSlug(projectSlug);
  const [sequence] = await db.select({ value: sql<string>`coalesce(max(substring(${cases.key} from '[0-9]+$')::numeric), 0)` }).from(cases).where(and(eq(cases.workspaceId, workspaceId), sql`${cases.key} ~ ${`^${prefix}-[0-9]+$`}`));
  const selected = searchParams?.get("case");
  const selectedRow = selected ? await db.query.cases.findFirst({
    where: and(eq(cases.workspaceId, workspaceId), or(eq(cases.key, selected), /^[0-9a-f-]{36}$/i.test(selected) ? eq(cases.id, selected) : undefined)),
    with: { folder: true, intent: true },
  }) : null;
  return {
    suggestedKey: `${prefix}-${BigInt(sequence.value) + BigInt(1)}`,
    selectedCase: selectedRow ? mapListedCase(selectedRow) : null,
    counts,
    initialPage: { ...listed, items: listed.items.map(mapListedCase) },
    cases: listed.items.map(mapListedCase),
    folders: folderRows.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
    })),
    views,
    projectPrefix: prefixFromProjectSlug(projectSlug),
    projectSlug,
  };
}

export async function getWorkspaceCaseByKey(
  workspaceId: string,
  key: string,
) {
  return db.query.cases.findFirst({
    where: and(eq(cases.workspaceId, workspaceId), eq(cases.key, key)),
    columns: { id: true, key: true, title: true },
  });
}

export function prefixFromProjectSlug(slug: string): string {
  return projectKeyPrefix(slug);
}
