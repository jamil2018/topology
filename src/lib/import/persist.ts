import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, folders } from "@/db/schema";
import type { MappedCase } from "./types";

export type PersistImportResult = {
  created: Array<{ id: string; key: string; title: string; folderId: string | null }>;
  skipped: string[];
  wouldCreate: number;
  wouldSkip: string[];
  folderIds: string[];
  primaryFolderId: string | null;
};

export async function persistImportedCases(options: {
  workspaceId: string;
  actorId: string;
  rows: MappedCase[];
  dryRun: boolean;
}): Promise<PersistImportResult> {
  const existing = await db.query.cases.findMany({
    where: eq(cases.workspaceId, options.workspaceId),
    columns: { key: true },
  });
  const existingKeys = new Set(existing.map((row) => row.key));
  const seen = new Set<string>();
  const wouldSkip: string[] = [];
  const toInsert: MappedCase[] = [];

  for (const row of options.rows) {
    if (existingKeys.has(row.key) || seen.has(row.key)) {
      wouldSkip.push(row.key);
      continue;
    }
    seen.add(row.key);
    toInsert.push(row);
  }

  if (options.dryRun) {
    return {
      created: [],
      skipped: wouldSkip,
      wouldCreate: toInsert.length,
      wouldSkip,
      folderIds: [],
      primaryFolderId: null,
    };
  }

  const existingFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.workspaceId, options.workspaceId));
  const folderByName = new Map(
    existingFolders.map((folder) => [folder.name.toLowerCase(), folder]),
  );

  const created: PersistImportResult["created"] = [];
  const skipped = [...wouldSkip];
  const folderIdSet = new Set<string>();

  for (const row of toInsert) {
    let folderId: string | null = null;
    if (row.folder) {
      const key = row.folder.toLowerCase();
      let folder = folderByName.get(key);
      if (!folder) {
        const [inserted] = await db
          .insert(folders)
          .values({ workspaceId: options.workspaceId, name: row.folder })
          .returning();
        folder = inserted;
        folderByName.set(key, inserted);
      }
      folderId = folder.id;
      folderIdSet.add(folder.id);
    }

    const tags = row.tags
      .split(/[;,]/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      const duplicate = await db.query.cases.findFirst({
        where: and(
          eq(cases.key, row.key),
          eq(cases.workspaceId, options.workspaceId),
        ),
      });
      if (duplicate) {
        skipped.push(row.key);
        continue;
      }
      const [createdRow] = await db
        .insert(cases)
        .values({
          workspaceId: options.workspaceId,
          key: row.key,
          title: row.title,
          description: row.description,
          preconditions: row.preconditions,
          steps: row.steps,
          expectedResult: row.expectedResult,
          priority: row.priority,
          status: row.status,
          folderId,
          tags,
          createdById: options.actorId,
        })
        .returning({
          id: cases.id,
          key: cases.key,
          title: cases.title,
          folderId: cases.folderId,
        });
      created.push(createdRow);
      if (createdRow.folderId) folderIdSet.add(createdRow.folderId);
    } catch {
      skipped.push(row.key);
    }
  }

  const folderIds = [...folderIdSet];
  return {
    created,
    skipped,
    wouldCreate: created.length,
    wouldSkip: skipped,
    folderIds,
    primaryFolderId: folderIds.length === 1 ? folderIds[0]! : null,
  };
}
