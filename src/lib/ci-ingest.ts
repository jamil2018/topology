import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  dedupeNormalizedResults,
  failureFingerprint,
  mergeShardResults,
  summarizeResults,
  type NormalizedResult,
} from "@topology/domain";
import { db } from "@/db";
import { cases, runResults, runShards, runs, triageItems } from "@/db/schema";
import { immutableMessageFor, isRunFrozen } from "@/lib/run-immutability";

const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;
const CASE_KEY_LIMIT = 80;

type IngestTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type IngestDb = typeof db | IngestTx;

export class CiIngestError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : "Ingest failed");
    this.name = "CiIngestError";
    this.status = status;
    this.body = body;
  }
}

export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ("code" in current && (current as { code?: unknown }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export function ciFailureResponse(err: unknown): {
  status: number;
  body: Record<string, unknown>;
} {
  if (err instanceof CiIngestError) {
    return { status: err.status, body: err.body };
  }
  if (isUniqueViolation(err)) {
    return { status: 409, body: { error: "Conflict" } };
  }
  return { status: 500, body: { error: "Ingest failed" } };
}

/** Stable case key. Keys that differ only after 80 sanitized chars do not collide. */
export function automationCaseKey(externalKey: string): string {
  const sanitized = externalKey.replace(/[^a-zA-Z0-9:_-]+/g, "_");
  const truncated = sanitized.slice(0, CASE_KEY_LIMIT);
  const prefixed = truncated.startsWith("AUTO-") ? truncated : `AUTO-${truncated}`;
  if (sanitized.length <= CASE_KEY_LIMIT) {
    return prefixed || "AUTO-unknown";
  }
  const hash = createHash("sha256").update(externalKey).digest("hex").slice(0, 8);
  const stem = prefixed.slice(0, Math.max(1, prefixed.length - hash.length - 1));
  return `${stem}-${hash}`;
}

export function clampDurationMs(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const n = Math.trunc(value);
  if (n > INT4_MAX) return INT4_MAX;
  if (n < INT4_MIN) return INT4_MIN;
  return n;
}

function caseValues(
  result: NormalizedResult,
  userId: string | null,
  workspaceId: string,
  key: string,
) {
  return {
    workspaceId,
    key,
    title: result.name || result.externalKey,
    description: `Imported from automation (${result.classname || "junit"})`,
    steps: "",
    expectedResult: "Test passes in CI",
    priority: "P2" as const,
    status: "ready" as const,
    tags: ["automation", "junit"],
    createdById: userId,
  };
}

async function insertCase(
  executor: IngestDb,
  values: ReturnType<typeof caseValues>,
): Promise<string | null> {
  try {
    return await executor.transaction(async (inner) => {
      const [row] = await inner
        .insert(cases)
        .values(values)
        .returning({ id: cases.id });
      return row?.id ?? null;
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return null;
  }
}

export async function findOrCreateCaseForExternal(
  result: NormalizedResult,
  userId: string | null,
  workspaceId: string,
  executor: IngestDb = db,
): Promise<string> {
  const key = automationCaseKey(result.externalKey);
  const existing = await executor.query.cases.findFirst({
    where: and(eq(cases.key, key), eq(cases.workspaceId, workspaceId)),
  });
  if (existing) return existing.id;

  const createdId = await insertCase(
    executor,
    caseValues(result, userId, workspaceId, key),
  );
  if (createdId) return createdId;

  const raced = await executor.query.cases.findFirst({
    where: and(eq(cases.key, key), eq(cases.workspaceId, workspaceId)),
  });
  if (raced) return raced.id;

  const altKey = `${key.slice(0, Math.max(1, key.length - 9))}-${createHash("sha256")
    .update(`${workspaceId}:${result.externalKey}:${randomBytes(4).toString("hex")}`)
    .digest("hex")
    .slice(0, 8)}`;
  const altId = await insertCase(
    executor,
    caseValues(result, userId, workspaceId, altKey),
  );
  if (altId) return altId;

  const altExisting = await executor.query.cases.findFirst({
    where: and(eq(cases.key, altKey), eq(cases.workspaceId, workspaceId)),
  });
  if (altExisting) return altExisting.id;

  throw new CiIngestError(409, { error: "Conflict" });
}

function summarizeStored(
  rows: {
    externalKey: string | null;
    classname: string | null;
    title: string | null;
    status: NormalizedResult["status"];
    notes: string;
    durationMs: number | null;
  }[],
) {
  return summarizeResults(
    rows.map((row) => ({
      externalKey: row.externalKey ?? row.title ?? "unknown",
      classname: row.classname ?? "",
      name: row.title ?? "",
      status: row.status,
      notes: row.notes,
      durationMs: row.durationMs ?? 0,
    })),
  );
}

async function replaceExternalResults(
  tx: IngestTx,
  runId: string,
  results: NormalizedResult[],
  userId: string | null,
  workspaceId: string,
) {
  const deduped = dedupeNormalizedResults(results);
  await tx
    .delete(runResults)
    .where(and(eq(runResults.runId, runId), isNotNull(runResults.externalKey)));

  for (const result of deduped) {
    const caseId = await findOrCreateCaseForExternal(
      result,
      userId,
      workspaceId,
      tx,
    );
    await tx.insert(runResults).values({
      runId,
      caseId,
      externalKey: result.externalKey,
      classname: result.classname,
      title: result.name,
      status: result.status,
      notes: result.notes,
      durationMs: clampDurationMs(result.durationMs),
      executedById: userId,
      executedAt: new Date(),
    });
  }

  return tx.query.runResults.findMany({
    where: eq(runResults.runId, runId),
  });
}

export async function upsertRunResultsFromNormalized(
  runId: string,
  results: NormalizedResult[],
  userId: string | null,
  workspaceId: string,
) {
  await db.transaction(async (tx) => {
    await tx
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.id, runId))
      .for("update");
    await replaceExternalResults(tx, runId, results, userId, workspaceId);
  });
}

export async function openTriageForFailures(runId: string) {
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });
  if (!run) return;

  const failures = await db.query.runResults.findMany({
    where: and(
      eq(runResults.runId, runId),
      inArray(runResults.status, ["failed", "blocked"]),
    ),
    with: { case: true },
  });

  for (const failure of failures) {
    await upsertTriageItem(failure, runId, run.workspaceId);
  }
}

function isTriageResultStatus(status: string) {
  return status === "failed" || status === "blocked";
}

export async function openTriageForResult(resultId: string) {
  const failure = await db.query.runResults.findFirst({
    where: eq(runResults.id, resultId),
    with: { case: true, run: true },
  });
  if (!failure || !failure.run || !isTriageResultStatus(failure.status)) return;
  await upsertTriageItem(failure, failure.runId, failure.run.workspaceId);
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
  workspaceId: string,
) {
  const caseKey = failure.case?.key ?? failure.externalKey ?? failure.id;
  const fingerprint = failureFingerprint({
    caseKey,
    notes: failure.notes,
  });

  const existing =
    (await db.query.triageItems.findFirst({
      where: and(
        eq(triageItems.workspaceId, workspaceId),
        eq(triageItems.fingerprint, fingerprint),
        inArray(triageItems.status, ["open", "snoozed"]),
      ),
    })) ??
    (await db.query.triageItems.findFirst({
      where: and(
        eq(triageItems.workspaceId, workspaceId),
        eq(triageItems.resultId, failure.id),
        inArray(triageItems.status, ["open", "snoozed"]),
      ),
    }));

  if (existing) {
    await db
      .update(triageItems)
      .set({
        fingerprint,
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
      workspaceId,
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

function parseShardPayload(raw: string): NormalizedResult[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as NormalizedResult[];
  } catch {
    return null;
  }
}

async function lockRun(tx: IngestTx, runId: string, workspaceId: string) {
  const locked = await tx
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)))
    .for("update");
  return locked[0] ?? null;
}

async function upsertShardRow(
  tx: IngestTx,
  runId: string,
  shardIndex: number,
  payloadJson: string,
) {
  const existing = await tx.query.runShards.findMany({
    where: and(eq(runShards.runId, runId), eq(runShards.shardIndex, shardIndex)),
  });

  if (existing.length === 0) {
    await tx.insert(runShards).values({ runId, shardIndex, payloadJson });
    return;
  }

  const [keep, ...dupes] = existing;
  await tx
    .update(runShards)
    .set({ payloadJson, receivedAt: new Date() })
    .where(eq(runShards.id, keep!.id));
  if (dupes.length > 0) {
    await tx.delete(runShards).where(
      inArray(
        runShards.id,
        dupes.map((row) => row.id),
      ),
    );
  }
}

async function loadMergedShards(tx: IngestTx, runId: string) {
  const rows = await tx.query.runShards.findMany({
    where: eq(runShards.runId, runId),
    orderBy: [runShards.shardIndex],
  });
  const byIndex = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const prev = byIndex.get(row.shardIndex);
    if (!prev || row.receivedAt >= prev.receivedAt) byIndex.set(row.shardIndex, row);
  }

  const shards: NormalizedResult[][] = [];
  const validIndexes: number[] = [];
  for (const index of [...byIndex.keys()].sort((a, b) => a - b)) {
    const parsed = parseShardPayload(byIndex.get(index)!.payloadJson);
    if (!parsed) continue;
    validIndexes.push(index);
    shards.push(parsed);
  }
  return { validIndexes, merged: mergeShardResults(shards) };
}

export function missingShardIndices(present: number[], shardTotal: number): number[] {
  const have = new Set(present);
  const missing: number[] = [];
  for (let index = 1; index <= shardTotal; index += 1) {
    if (!have.has(index)) missing.push(index);
  }
  return missing;
}

export async function submitRunShard(input: {
  runId: string;
  workspaceId: string;
  userId: string | null;
  shardIndex: number;
  results: NormalizedResult[];
}) {
  return db.transaction(async (tx) => {
    const locked = await lockRun(tx, input.runId, input.workspaceId);
    if (!locked) throw new CiIngestError(404, { error: "Run not found" });
    if (isRunFrozen(locked.status)) {
      throw new CiIngestError(409, { error: immutableMessageFor(locked.status) });
    }
    if (input.shardIndex > locked.shardTotal) {
      throw new CiIngestError(400, {
        error: "shardIndex must be between 1 and shardTotal",
      });
    }

    await upsertShardRow(
      tx,
      input.runId,
      input.shardIndex,
      JSON.stringify(input.results),
    );
    const { validIndexes, merged } = await loadMergedShards(tx, input.runId);
    const stored = await replaceExternalResults(
      tx,
      input.runId,
      merged,
      input.userId,
      input.workspaceId,
    );
    const received = validIndexes.filter(
      (index) => index >= 1 && index <= locked.shardTotal,
    ).length;
    const [updated] = await tx
      .update(runs)
      .set({
        shardsReceived: received,
        status: "in_progress",
        updatedAt: new Date(),
      })
      .where(eq(runs.id, input.runId))
      .returning();

    return {
      run: updated ?? locked,
      received,
      summary: summarizeStored(stored),
    };
  });
}

export async function completeCiRun(input: {
  runId: string;
  workspaceId: string;
  userId: string | null;
}) {
  return db.transaction(async (tx) => {
    const locked = await lockRun(tx, input.runId, input.workspaceId);
    if (!locked) throw new CiIngestError(404, { error: "Run not found" });
    if (isRunFrozen(locked.status)) {
      throw new CiIngestError(409, { error: immutableMessageFor(locked.status) });
    }

    const { validIndexes, merged } = await loadMergedShards(tx, input.runId);
    const missing = missingShardIndices(validIndexes, locked.shardTotal);
    if (missing.length > 0) {
      throw new CiIngestError(409, { error: "incomplete", missing });
    }

    const stored = await replaceExternalResults(
      tx,
      input.runId,
      merged,
      input.userId,
      input.workspaceId,
    );
    const summary = summarizeStored(stored);
    if (stored.some((row) => row.status === "failed") && summary.failed === 0) {
      throw new CiIngestError(409, {
        error: "Stored failures do not match the summary",
      });
    }

    const [updated] = await tx
      .update(runs)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
        shardsReceived: locked.shardTotal,
      })
      .where(and(eq(runs.id, input.runId), eq(runs.status, "in_progress")))
      .returning();
    if (!updated) {
      throw new CiIngestError(409, { error: immutableMessageFor("completed") });
    }

    return { run: updated, summary };
  });
}

export async function submitJunitResults(input: {
  workspaceId: string;
  userId: string | null;
  runId?: string;
  name: string;
  source: string;
  branch?: string;
  commitSha?: string;
  results: NormalizedResult[];
}) {
  return db.transaction(async (tx) => {
    let runId = input.runId;
    let runName = input.name;

    if (runId) {
      const locked = await lockRun(tx, runId, input.workspaceId);
      if (!locked) throw new CiIngestError(404, { error: "Run not found" });
      if (isRunFrozen(locked.status)) {
        throw new CiIngestError(409, { error: immutableMessageFor(locked.status) });
      }
      if (locked.shardTotal > 1) {
        throw new CiIngestError(409, {
          error: "Sharded runs must be completed after all shards are posted",
        });
      }
      const existingShards = await tx.query.runShards.findMany({
        where: eq(runShards.runId, runId),
      });
      if (existingShards.length > 0) {
        throw new CiIngestError(409, {
          error: "Sharded runs must be completed after all shards are posted",
        });
      }
      runName = locked.name;
    } else {
      const [created] = await tx
        .insert(runs)
        .values({
          workspaceId: input.workspaceId,
          name: input.name,
          kind: "automation",
          source: input.source,
          branch: input.branch,
          commitSha: input.commitSha,
          status: "in_progress",
          environment: "ci",
          startedAt: new Date(),
          createdById: input.userId,
          shardTotal: 1,
          shardsReceived: 0,
        })
        .returning();
      if (!created) throw new CiIngestError(500, { error: "Ingest failed" });
      runId = created.id;
      runName = created.name;
    }

    const stored = await replaceExternalResults(
      tx,
      runId,
      input.results,
      input.userId,
      input.workspaceId,
    );
    const summary = summarizeStored(stored);
    const [updated] = await tx
      .update(runs)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
        shardsReceived: 1,
      })
      .where(eq(runs.id, runId))
      .returning();
    if (!updated) throw new CiIngestError(500, { error: "Ingest failed" });

    return { runId, runName: updated.name || runName, summary };
  });
}

export async function listAutomationRuns(workspaceId: string) {
  return db.query.runs.findMany({
    where: and(eq(runs.kind, "automation"), eq(runs.workspaceId, workspaceId)),
    orderBy: [desc(runs.updatedAt)],
  });
}

export { sql };
