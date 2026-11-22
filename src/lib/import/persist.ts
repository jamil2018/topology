import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { caseImportSources, cases, folders } from "@/db/schema";
import { isUniqueViolation } from "@/lib/http-errors";
import { persistCase } from "@/lib/case-create";
import { importedCaseStatus, lockCaseReviewPolicy } from "@/lib/case-review-policy";
import type { ImportProvider, MappedCase } from "./types";

type ImportedCase = { id: string; key: string; title: string; folderId: string | null };
type Skip = { key: string; reason: "existing_key" | "existing_source" | "duplicate_input" | "write_failed" };
type ImportOptions = {
  workspaceId: string;
  actorId: string;
  rows: MappedCase[];
  dryRun: boolean;
  provider: ImportProvider;
  sourceNamespace: string;
};
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function findFolder(tx: Transaction, workspaceId: string, path: string) {
  const labels = path.replace(/^\/+/, "").split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  if (!labels.length) return null;
  // Older imports stored the complete label in a single root folder.
  const [legacy] = await tx.select({ id: folders.id }).from(folders).where(and(
    eq(folders.workspaceId, workspaceId),
    sql`${folders.parentId} is null and lower(${folders.name}) = lower(${path})`,
  )).orderBy(folders.id).limit(1);
  if (legacy) return legacy.id;

  let parentId: string | null = null;
  for (const name of labels) {
    const [found] = await tx.select({ id: folders.id }).from(folders).where(and(
      eq(folders.workspaceId, workspaceId),
      sql`${folders.parentId} is not distinct from ${parentId}::uuid
        and lower(${folders.name}) = lower(${name})`,
    )).orderBy(folders.id).limit(1);
    if (found) {
      parentId = found.id;
    } else {
      const [created]: Array<{ id: string }> = await tx.insert(folders).values({ workspaceId, name, parentId }).returning({ id: folders.id });
      parentId = created.id;
    }
  }
  return parentId;
}

function sourceWhere(options: ImportOptions) {
  return and(
    eq(caseImportSources.workspaceId, options.workspaceId),
    eq(caseImportSources.provider, options.provider),
    eq(caseImportSources.namespace, options.sourceNamespace),
  );
}

async function persistRow(options: ImportOptions, row: MappedCase): Promise<ImportedCase | Skip> {
  const { workspaceId, actorId } = options;
  return db.transaction(async (tx) => {
    const requireReview = await lockCaseReviewPolicy(tx, workspaceId);
    // Serialize folder creation and source reconciliation across vendor imports.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`case-import:${workspaceId}`}, 0))`);
    if (row.sourceId) {
      const [existing] = await tx.select({ id: caseImportSources.caseId }).from(caseImportSources)
        .where(and(sourceWhere(options), eq(caseImportSources.sourceId, row.sourceId)));
      if (existing) return { key: row.key, reason: "existing_source" };
    }
    const [existing] = await tx.select({ id: cases.id }).from(cases)
      .where(and(eq(cases.workspaceId, workspaceId), eq(cases.key, row.key)));
    if (existing) return { key: row.key, reason: "existing_key" };

    const folderId = row.folder ? await findFolder(tx, workspaceId, row.folder) : null;
    const created = await persistCase(tx, workspaceId, actorId, {
      key: row.key,
      title: row.title,
      description: row.description,
      preconditions: row.preconditions,
      steps: row.steps,
      expectedResult: row.expectedResult,
      priority: row.priority,
      status: importedCaseStatus(row.status, requireReview),
      folderId,
      tags: row.tags.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean),
      structuredSteps: row.structuredSteps?.map((step) => ({
        action: step.action, expected: step.expected ?? "", data: step.data ?? "",
      })),
    });
    if (row.sourceId) {
      await tx.insert(caseImportSources).values({
        workspaceId, provider: options.provider, namespace: options.sourceNamespace,
        sourceId: row.sourceId, caseId: created.id,
      });
    }
    return { id: created.id, key: created.key, title: created.title, folderId: created.folderId };
  });
}

export async function persistImportedCases(options: ImportOptions) {
  const imported = new Set<string>();
  const keys = new Set<string>();
  const skipped: Skip[] = [];
  const eligible: MappedCase[] = [];
  const created: ImportedCase[] = [];
  const distinctKeys = [...new Set(options.rows.map(({ key }) => key))];
  const sourceIds = [...new Set(options.rows.flatMap(({ sourceId }) => sourceId ? [sourceId] : []))];

  // Bound parameter counts for uploads with many rows.
  for (let start = 0; start < distinctKeys.length; start += 500) {
    const rows = await db.select({ key: cases.key }).from(cases).where(and(
      eq(cases.workspaceId, options.workspaceId), inArray(cases.key, distinctKeys.slice(start, start + 500)),
    ));
    rows.forEach(({ key }) => keys.add(key));
  }
  for (let start = 0; start < sourceIds.length; start += 500) {
    const rows = await db.select({ id: caseImportSources.sourceId }).from(caseImportSources)
      .where(and(sourceWhere(options), inArray(caseImportSources.sourceId, sourceIds.slice(start, start + 500))));
    rows.forEach(({ id }) => imported.add(id));
  }

  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  for (const row of options.rows) {
    const sourceId = row.sourceId;
    if (sourceId && imported.has(sourceId)) skipped.push({ key: row.key, reason: "existing_source" });
    else if (keys.has(row.key)) skipped.push({ key: row.key, reason: "existing_key" });
    else if (seenKeys.has(row.key) || (sourceId && seenIds.has(sourceId))) {
      skipped.push({ key: row.key, reason: "duplicate_input" });
    } else {
      seenKeys.add(row.key);
      if (sourceId) seenIds.add(sourceId);
      eligible.push(row);
    }
  }

  if (!options.dryRun) {
    for (const row of eligible) {
      try {
        const saved = await persistRow(options, row);
        if ("reason" in saved) skipped.push(saved);
        else created.push(saved);
      } catch (error) {
        skipped.push({ key: row.key, reason: isUniqueViolation(error) ? "existing_key" : "write_failed" });
      }
    }
  }
  const folderIds = [...new Set(created.flatMap(({ folderId }) => folderId ? [folderId] : []))];
  const skippedKeys = skipped.map(({ key }) => key);
  return {
    created, skipped: skippedKeys, skipDetails: skipped,
    wouldCreate: options.dryRun ? eligible.length : created.length,
    wouldSkip: skippedKeys, folderIds,
    primaryFolderId: folderIds.length === 1 ? folderIds[0] : null,
  };
}
