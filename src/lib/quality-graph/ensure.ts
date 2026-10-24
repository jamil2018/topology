import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, testImplementations, testIntents, type Case } from "@/db/schema";

/** Subset of db/tx used by ensureIntentForCase (works with drizzle transactions). */
export type QualityGraphDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: any;
};

export function implementationTypeForCase(row: {
  key: string;
  tags: string[] | null;
}): "manual" | "junit" {
  const tags = row.tags ?? [];
  if (
    row.key.startsWith("AUTO-") ||
    tags.includes("junit") ||
    tags.includes("automation")
  ) {
    return "junit";
  }
  return "manual";
}

/**
 * Ensure a case has a linked Test Intent + matching implementation.
 * Safe to call repeatedly (idempotent upsert by workspace+key).
 */
export async function ensureIntentForCase(
  row: Pick<
    Case,
    | "id"
    | "workspaceId"
    | "key"
    | "title"
    | "description"
    | "priority"
    | "status"
    | "folderId"
    | "assigneeId"
    | "intentId"
    | "tags"
  >,
  executor: QualityGraphDb = db,
  options?: { externalKey?: string | null; framework?: string | null },
): Promise<{ intentId: string; implementationId: string }> {
  if (row.intentId) {
    const existingImpl = await executor.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.caseId, row.id),
        eq(testImplementations.intentId, row.intentId),
      ),
    });
    if (existingImpl) {
      return { intentId: row.intentId, implementationId: existingImpl.id };
    }
    const type = implementationTypeForCase(row);
    const [created] = await executor
      .insert(testImplementations)
      .values({
        workspaceId: row.workspaceId,
        intentId: row.intentId,
        type,
        caseId: row.id,
        externalKey: options?.externalKey ?? (type === "junit" ? row.key : null),
        framework: options?.framework ?? (type === "junit" ? "junit" : null),
      })
      .returning({ id: testImplementations.id });
    return { intentId: row.intentId, implementationId: created.id };
  }

  let intent = await executor.query.testIntents.findFirst({
    where: and(
      eq(testIntents.workspaceId, row.workspaceId),
      eq(testIntents.key, row.key),
    ),
  });

  if (!intent) {
    try {
      const [created] = await executor
        .insert(testIntents)
        .values({
          workspaceId: row.workspaceId,
          key: row.key,
          title: row.title,
          behavior: row.description?.trim() ? row.description : row.title,
          criticality: row.priority,
          status: row.status,
          folderId: row.folderId,
          assigneeId: row.assigneeId,
        })
        .returning();
      intent = created;
    } catch {
      intent = await executor.query.testIntents.findFirst({
        where: and(
          eq(testIntents.workspaceId, row.workspaceId),
          eq(testIntents.key, row.key),
        ),
      });
      if (!intent) throw new Error("Failed to create test intent");
    }
  }

  await executor
    .update(cases)
    .set({ intentId: intent.id, updatedAt: new Date() })
    .where(eq(cases.id, row.id));

  const type = implementationTypeForCase(row);
  const existingImpl = await executor.query.testImplementations.findFirst({
    where: and(
      eq(testImplementations.intentId, intent.id),
      eq(testImplementations.caseId, row.id),
    ),
  });
  if (existingImpl) {
    return { intentId: intent.id, implementationId: existingImpl.id };
  }

  const [impl] = await executor
    .insert(testImplementations)
    .values({
      workspaceId: row.workspaceId,
      intentId: intent.id,
      type,
      caseId: row.id,
      externalKey: options?.externalKey ?? (type === "junit" ? row.key : null),
      framework: options?.framework ?? (type === "junit" ? "junit" : null),
    })
    .returning({ id: testImplementations.id });

  return { intentId: intent.id, implementationId: impl.id };
}

