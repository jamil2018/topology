import { importedCaseStatus, lockCaseReviewPolicy } from "@/lib/case-review-policy";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, folders } from "@/db/schema";
import type { CsvCaseRow } from "@/lib/csv";
import {
  buildCsvImportSample,
  type CsvImportPreviewRow,
} from "@/lib/import/csv-preview";
import { parseFallbackSteps } from "@/lib/tcm/steps";
import { replaceCaseSteps, upsertCustomFieldValues } from "@/lib/tcm/case-tcm";

export type { CsvImportPreviewRow };
export { buildCsvImportSample } from "@/lib/import/csv-preview";

export type CsvImportResult = {
  created: Array<{
    id: string;
    key: string;
    title: string;
    folderId: string | null;
  }>;
  skipped: string[];
  wouldCreate: number;
  wouldSkip: string[];
  folderIds: string[];
  primaryFolderId: string | null;
  sample: CsvImportPreviewRow[];
};

export async function persistCsvCases(options: {
  workspaceId: string;
  actorId: string;
  rows: CsvCaseRow[];
  dryRun: boolean;
}): Promise<CsvImportResult> {
  const existing = await db.query.cases.findMany({
    where: eq(cases.workspaceId, options.workspaceId),
    columns: { key: true },
  });
  const existingKeys = new Set(existing.map((row) => row.key));
  const seen = new Set<string>();
  const wouldSkip: string[] = [];
  const toInsert: CsvCaseRow[] = [];

  for (const row of options.rows) {
    if (existingKeys.has(row.key) || seen.has(row.key)) {
      wouldSkip.push(row.key);
      continue;
    }
    seen.add(row.key);
    toInsert.push(row);
  }

  const sample = buildCsvImportSample(options.rows);
  if (options.dryRun) {
    return {
      created: [],
      skipped: wouldSkip,
      wouldCreate: toInsert.length,
      wouldSkip,
      folderIds: [],
      primaryFolderId: null,
      sample,
    };
  }

  const existingFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.workspaceId, options.workspaceId));
  const folderByName = new Map(
    existingFolders.map((folder) => [folder.name.toLowerCase(), folder]),
  );

  const created: CsvImportResult["created"] = [];
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
      const createdRow = await db.transaction(async (tx) => {
        const requireReview = await lockCaseReviewPolicy(tx, options.workspaceId);
        const duplicate = await tx.query.cases.findFirst({
          where: and(
            eq(cases.key, row.key),
            eq(cases.workspaceId, options.workspaceId),
          ),
        });
        if (duplicate) return null;

        const [createdRow] = await tx
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
            status: importedCaseStatus(row.status, requireReview),
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

        if (row.customFields && Object.keys(row.customFields).length > 0) {
          await upsertCustomFieldValues({
            workspaceId: options.workspaceId,
            entityType: "case",
            entityId: createdRow.id,
            values: row.customFields,
          }, tx);
        }

        const structured = parseFallbackSteps(
          row.steps ?? "",
          row.expectedResult ?? "",
        ).filter((step) => step.action.trim() || step.expected.trim());
        if (structured.length > 0) {
          await replaceCaseSteps({
            workspaceId: options.workspaceId,
            caseId: createdRow.id,
            steps: structured.map((step) => ({
              action: step.action,
              expected: step.expected,
              data: step.data,
              sharedStepId: step.sharedStepId,
            })),
          }, tx);
        }

        return createdRow;
      });
      if (!createdRow) {
        skipped.push(row.key);
        continue;
      }
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
    sample,
  };
}
