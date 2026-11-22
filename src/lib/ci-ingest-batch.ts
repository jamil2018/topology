import { and, eq, inArray, sql } from "drizzle-orm";
import type { NormalizedResult } from "@topology/domain";
import { db } from "@/db";
import { cases, testImplementations, testIntents } from "@/db/schema";
import { implementationTypeForCase } from "./quality-graph/ensure";
import { lockCaseReviewPolicy } from "./case-review-policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const BATCH = 500;

/** Resolve identities in bounded batches, preserving existing case/intent links.
 * Lock cases in key order so concurrent runs cannot create duplicate implementations.
 */
export async function resolveExternalLinks(
  tx: Tx, results: NormalizedResult[], workspaceId: string, userId: string | null,
  keyFor: (externalKey: string) => string,
) {
  const byKey = new Map<string, NormalizedResult>();
  for (const result of results) {
    const key = keyFor(result.externalKey);
    if (!byKey.has(key)) byKey.set(key, result);
  }
  const keys = [...byKey.keys()].sort();
  const links = new Map<string, { caseId: string; implementationId: string }>();
  if (!keys.length) return links;
  const status: "draft" | "ready" = await lockCaseReviewPolicy(tx, workspaceId) ? "draft" : "ready";
  for (let offset = 0; offset < keys.length; offset += BATCH) {
    const batch = keys.slice(offset, offset + BATCH);
    await tx.insert(cases).values(batch.map((key) => {
      const result = byKey.get(key)!;
      return { workspaceId, key, title: result.name || result.externalKey,
        description: `Imported from automation (${result.classname || "junit"})`,
        steps: "", expectedResult: "Test passes in CI", priority: "P2" as const,
        status, tags: ["automation", "junit"], createdById: userId };
    })).onConflictDoNothing({ target: [cases.workspaceId, cases.key] });
    const rows = await tx.select().from(cases)
      .where(and(eq(cases.workspaceId, workspaceId), inArray(cases.key, batch)))
      .orderBy(cases.key).for("update");
    const unlinked = rows.filter((row) => !row.intentId);
    if (unlinked.length) {
      await tx.insert(testIntents).values(unlinked.map((row) => ({
        workspaceId, key: row.key, title: row.title, behavior: row.description?.trim() ? row.description : row.title,
        criticality: row.priority, status: row.status, folderId: row.folderId, assigneeId: row.assigneeId,
      }))).onConflictDoNothing({ target: [testIntents.workspaceId, testIntents.key] });
      const intents = await tx.select({ id: testIntents.id, key: testIntents.key }).from(testIntents)
        .where(and(eq(testIntents.workspaceId, workspaceId), inArray(testIntents.key, unlinked.map((row) => row.key))));
      const ids = new Map(intents.map((intent) => [intent.key, intent.id]));
      const pairs = unlinked.map((row) => {
        const intentId = ids.get(row.key);
        if (!intentId) throw new Error("Failed to resolve imported test intent");
        row.intentId = intentId;
        return sql`(${row.id}::uuid, ${intentId}::uuid)`;
      });
      await tx.execute(sql`UPDATE ${cases} AS c SET intent_id = links.intent_id, updated_at = now()
        FROM (VALUES ${sql.join(pairs, sql`, `)}) AS links(case_id, intent_id)
        WHERE c.id = links.case_id AND c.workspace_id = ${workspaceId}::uuid`);
    }
    const implementations = await tx.select().from(testImplementations)
      .where(and(eq(testImplementations.workspaceId, workspaceId), inArray(testImplementations.caseId, rows.map((row) => row.id))));
    const existing = new Map(implementations.map((impl) => [`${impl.caseId}:${impl.intentId}`, impl.id]));
    const missing = rows.filter((row) => !existing.has(`${row.id}:${row.intentId}`));
    if (missing.length) {
      const created = await tx.insert(testImplementations).values(missing.map((row) => ({
        workspaceId, caseId: row.id, intentId: row.intentId!, type: implementationTypeForCase(row),
        externalKey: byKey.get(row.key)!.externalKey, framework: "junit",
      }))).returning();
      for (const impl of created) existing.set(`${impl.caseId}:${impl.intentId}`, impl.id);
    }
    for (const row of rows) {
      const implementationId = existing.get(`${row.id}:${row.intentId}`);
      if (!implementationId) throw new Error("Failed to resolve imported implementation");
      links.set(row.key, { caseId: row.id, implementationId });
    }
  }
  return links;
}
