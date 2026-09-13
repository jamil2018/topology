import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  failureFingerprint,
  type NormalizedResult,
} from "@topology/domain";
import { db } from "@/db";
import { cases, runResults, runShards, runs, triageItems } from "@/db/schema";

export async function findOrCreateCaseForExternal(
  result: NormalizedResult,
  userId: string | null,
): Promise<string> {
  const keyBase = result.externalKey
    .replace(/[^a-zA-Z0-9:_-]+/g, "_")
    .slice(0, 80);
  const key = keyBase.startsWith("AUTO-") ? keyBase : `AUTO-${keyBase}`;

  const existing = await db.query.cases.findFirst({
    where: eq(cases.key, key),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(cases)
    .values({
      key,
      title: result.name || result.externalKey,
      description: `Imported from automation (${result.classname || "junit"})`,
      steps: "",
      expectedResult: "Test passes in CI",
      priority: "P2",
      status: "ready",
      tags: ["automation", "junit"],
      createdById: userId,
    })
    .returning();

  return created.id;
}

export async function upsertRunResultsFromNormalized(
  runId: string,
  results: NormalizedResult[],
  userId: string | null,
) {
  const existing = await db.query.runResults.findMany({
    where: eq(runResults.runId, runId),
  });
  const byExternal = new Map(
    existing
      .filter((r) => r.externalKey)
      .map((r) => [r.externalKey as string, r]),
  );
  const byCase = new Map(
    existing.filter((r) => r.caseId).map((r) => [r.caseId as string, r]),
  );

  for (const result of results) {
    const caseId = await findOrCreateCaseForExternal(result, userId);
    const prior =
      byExternal.get(result.externalKey) ?? byCase.get(caseId) ?? null;

    if (prior) {
      await db
        .update(runResults)
        .set({
          caseId,
          externalKey: result.externalKey,
          classname: result.classname,
          title: result.name,
          status: result.status,
          notes: result.notes,
          durationMs: result.durationMs,
          executedById: userId,
          executedAt: new Date(),
        })
        .where(eq(runResults.id, prior.id));
    } else {
      await db.insert(runResults).values({
        runId,
        caseId,
        externalKey: result.externalKey,
        classname: result.classname,
        title: result.name,
        status: result.status,
        notes: result.notes,
        durationMs: result.durationMs,
        executedById: userId,
        executedAt: new Date(),
      });
    }
  }
}

export async function openTriageForFailures(runId: string) {
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });
  if (!run) return;

  const failures = await db.query.runResults.findMany({
    where: and(eq(runResults.runId, runId), eq(runResults.status, "failed")),
    with: { case: true },
  });

  for (const failure of failures) {
    await upsertTriageItem(failure, runId);
  }
}

export async function openTriageForResult(resultId: string) {
  const failure = await db.query.runResults.findFirst({
    where: eq(runResults.id, resultId),
    with: { case: true },
  });
  if (!failure || failure.status !== "failed") return;
  await upsertTriageItem(failure, failure.runId);
}

async function upsertTriageItem(
  failure: {
    id: string;
    notes: string;
    caseId: string | null;
    title: string | null;
    externalKey: string | null;
    case?: { key: string; title: string; priority: "P0" | "P1" | "P2" | "P3" } | null;
  },
  runId: string,
) {
  const caseKey = failure.case?.key ?? failure.externalKey ?? failure.id;
  const fingerprint = failureFingerprint({
    caseKey,
    notes: failure.notes,
  });

  const existing = await db.query.triageItems.findFirst({
    where: and(
      eq(triageItems.fingerprint, fingerprint),
      inArray(triageItems.status, ["open", "snoozed"]),
    ),
  });

  if (existing) {
    await db
      .update(triageItems)
      .set({
        occurrenceCount: existing.occurrenceCount + 1,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
        runId,
        resultId: failure.id,
        caseId: failure.caseId,
        notes: failure.notes,
      })
      .where(eq(triageItems.id, existing.id));
  } else {
    await db.insert(triageItems).values({
      fingerprint,
      title: failure.case?.title ?? failure.title ?? caseKey,
      priority: failure.case?.priority ?? "P2",
      caseId: failure.caseId,
      runId,
      resultId: failure.id,
      notes: failure.notes,
      occurrenceCount: 1,
      status: "open",
    });
  }
}

export async function storeShardPayload(
  runId: string,
  shardIndex: number,
  results: NormalizedResult[],
) {
  const existing = await db.query.runShards.findFirst({
    where: and(
      eq(runShards.runId, runId),
      eq(runShards.shardIndex, shardIndex),
    ),
  });

  const payloadJson = JSON.stringify(results);

  if (existing) {
    await db
      .update(runShards)
      .set({ payloadJson, receivedAt: new Date() })
      .where(eq(runShards.id, existing.id));
  } else {
    await db.insert(runShards).values({
      runId,
      shardIndex,
      payloadJson,
    });
  }
}

export async function loadShardResults(
  runId: string,
): Promise<NormalizedResult[][]> {
  const shards = await db.query.runShards.findMany({
    where: eq(runShards.runId, runId),
    orderBy: [runShards.shardIndex],
  });

  return shards.map((shard) => JSON.parse(shard.payloadJson) as NormalizedResult[]);
}

export async function listAutomationRuns() {
  return db.query.runs.findMany({
    where: eq(runs.kind, "automation"),
    orderBy: [desc(runs.updatedAt)],
  });
}

export { sql };
