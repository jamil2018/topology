/** Real PostgreSQL regression for batch boundaries, existing graph links and rollback. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cases, implementationStats, runResults, runs, testImplementations, testIntents, users, workspaces } from "@/db/schema";
import { refreshImplementationStatsForRun } from "@/lib/implementation-stats";
import { automationCaseKey, submitJunitResults } from "@/lib/ci-ingest";
import type { NormalizedResult } from "@topology/domain";

const project = randomUUID(), foreign = randomUUID(), user = randomUUID();
const results: NormalizedResult[] = Array.from({ length: 501 }, (_, index) => ({
  externalKey: `batch::${index}`, classname: "batch", name: `Batch ${index}`, status: "passed", durationMs: 10, notes: "",
}));
const submit = (input: NormalizedResult[], workspaceId = project) => submitJunitResults({ workspaceId, userId: user, name: "Batch regression", source: "cli", results: input });
describe("batched automation graph and statistics", () => {
  beforeAll(async () => {
    await db.insert(users).values({ id: user, email: `${user}@batch.test` });
    await db.insert(workspaces).values([{ id: project, name: "Batch", slug: project }, { id: foreign, name: "Foreign", slug: foreign }]);
    const [intent] = await db.insert(testIntents).values({ workspaceId: project, key: "CURATED", title: "Keep the authored intent" }).returning();
    await db.insert(cases).values({ workspaceId: project, key: automationCaseKey(results[0].externalKey), title: "Keep the authored case", intentId: intent.id });
  });
  afterAll(async () => {
    await db.delete(workspaces).where(inArray(workspaces.id, [project, foreign]));
    await db.delete(users).where(eq(users.id, user));
  });
  it("crosses the 500-row boundary without losing deduplication or authored links", async () => {
    const outcome = await submit([...results, { ...results[500], status: "failed", durationMs: 200, notes: "Final outcome" }]);
    expect(outcome.summary).toMatchObject({ total: 501, passed: 500, failed: 1 });
    const saved = await db.query.runResults.findMany({ where: eq(runResults.runId, outcome.runId) });
    expect(saved).toHaveLength(501);
    expect(new Set(saved.map((row) => row.caseId)).size).toBe(501);
    expect(saved.every((row) => row.implementationId)).toBe(true);
    const authored = await db.query.cases.findFirst({ where: and(eq(cases.workspaceId, project), eq(cases.key, automationCaseKey(results[0].externalKey))) });
    expect(authored?.title).toBe("Keep the authored case");
    const intent = await db.query.testIntents.findFirst({ where: eq(testIntents.id, authored!.intentId!) });
    expect(intent?.key).toBe("CURATED");
    const stats = await db.query.implementationStats.findMany({ where: inArray(implementationStats.implementationId, saved.map((row) => row.implementationId!)) });
    expect(stats).toHaveLength(1002);
    const failed = saved.find((row) => row.externalKey === results[500].externalKey)!;
    expect(stats.filter((row) => row.implementationId === failed.implementationId).map((row) => row.passRate)).toEqual([0, 0]);
  });
  it("serializes concurrent case identity creation and preserves project isolation", async () => {
    const input = results.slice(0, 5);
    const [first, second, other] = await Promise.all([submit(input), submit(input), submit(input, foreign)]);
    const load = (id: string) => db.query.runResults.findMany({ where: eq(runResults.runId, id) });
    const [a, b, c] = await Promise.all([load(first.runId), load(second.runId), load(other.runId)]);
    expect(a.map((row) => row.implementationId).sort()).toEqual(b.map((row) => row.implementationId).sort());
    expect(a.every((row) => c.every((foreignRow) => foreignRow.caseId !== row.caseId))).toBe(true);
    const linked = await db.query.testImplementations.findMany({ where: and(eq(testImplementations.workspaceId, project), inArray(testImplementations.caseId, a.map((row) => row.caseId!))) });
    expect(linked).toHaveLength(5);
  });
  it("retains legacy case-linked history in the correct rolling windows", async () => {
    const outcome = await submit([{ ...results[0], externalKey: "legacy::history" }]);
    const current = await db.query.runResults.findFirst({ where: eq(runResults.runId, outcome.runId) });
    const [legacy] = await db.insert(runs).values({ workspaceId: project, name: "Legacy history", status: "completed" }).returning();
    const at = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await db.insert(runResults).values({ runId: legacy.id, caseId: current!.caseId, status: "failed", durationMs: 40, executedAt: at, createdAt: at });
    await refreshImplementationStatsForRun(legacy.id);
    const rollups = await db.query.implementationStats.findMany({ where: eq(implementationStats.implementationId, current!.implementationId!) });
    expect(rollups.find((row) => row.windowDays === 7)).toMatchObject({ passRate: 100, durationP95: 10, lastStatus: "passed" });
    expect(rollups.find((row) => row.windowDays === 30)).toMatchObject({ passRate: 50, durationP95: 40, lastStatus: "passed" });
  });
  it("keeps distinct external results that sanitize to the same existing case key", async () => {
    const outcome = await submit([{ ...results[0], externalKey: "collision::a b" }, { ...results[0], externalKey: "collision::a_b" }]);
    const saved = await db.query.runResults.findMany({ where: eq(runResults.runId, outcome.runId) });
    expect(saved).toHaveLength(2);
    expect(saved[0].caseId).toBe(saved[1].caseId);
    expect(saved[0].implementationId).toBe(saved[1].implementationId);
  });
  it("rolls back graph creation if a later result write fails", async () => {
    const invalid = { ...results[0], externalKey: "rollback::invalid", status: "invalid" as NormalizedResult["status"] };
    await expect(submit([invalid])).rejects.toThrow();
    expect(await db.query.cases.findFirst({ where: and(eq(cases.workspaceId, project), eq(cases.key, automationCaseKey(invalid.externalKey))) })).toBeUndefined();
    expect(await db.query.testIntents.findFirst({ where: and(eq(testIntents.workspaceId, project), eq(testIntents.key, automationCaseKey(invalid.externalKey))) })).toBeUndefined();
  });
});
