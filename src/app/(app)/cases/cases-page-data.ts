import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cases } from "@/db/schema";
import { caseListQueryFromSearchParams } from "@/lib/case-list";
import { listCases, listFolders, listSavedViews } from "@/lib/queries";
import type { CaseRow, Folder } from "@/components/cases-model";
import { projectKeyPrefix } from "@/components/cases-model";
import type { SavedViewRow } from "@/components/saved-views-bar";

export type CasesWorkspaceData = {
  cases: CaseRow[];
  folders: Folder[];
  views: SavedViewRow[];
  projectPrefix: string;
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
  // Workspace still filters/paginates client-side; load the full matching set.
  query.all = true;
  const [listed, folderRows, views] = await Promise.all([
    listCases(workspaceId, query),
    listFolders(workspaceId),
    listSavedViews(workspaceId, "cases", userId),
  ]);

  return {
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
