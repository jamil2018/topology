import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, caseImportSources, cases, runResults, runs, users, workspaceMembers, workspaces } from "@/db/schema";
import { POST } from "@/app/api/import/history/route";
import * as attachmentStorage from "@/lib/attachments";

const identity = vi.hoisted(() => ({ actorId: "" }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: identity.actorId } }) }));
const project = randomUUID();
const actor = randomUUID();
const viewer = randomUUID();
const caseId = randomUUID();
const sourceNamespace = "history-test";

beforeAll(async () => {
  await db.insert(users).values([actor, viewer].map((id) => ({ id, email: `${id}@historical.test` })));
  await db.insert(workspaces).values({ id: project, slug: `history-${project}`, name: "Historical import" });
  await db.insert(workspaceMembers).values([
    { workspaceId: project, userId: actor, role: "admin" },
    { workspaceId: project, userId: viewer, role: "viewer" },
  ]);
  await db.insert(cases).values({ id: caseId, workspaceId: project, key: "BILLING-42", title: "Current checkout title" });
  await db.insert(caseImportSources).values([
    { workspaceId: project, provider: "testrail", namespace: sourceNamespace, sourceId: "C42", caseId },
    { workspaceId: project, provider: "qase", namespace: sourceNamespace, sourceId: "42", caseId },
  ]);
  identity.actorId = actor;
});

afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, project));
  await db.delete(users).where(eq(users.id, actor));
  await db.delete(users).where(eq(users.id, viewer));
});

function submit(body: unknown, digest?: string) {
  const query = digest ? `?mode=apply&digest=${digest}` : "?mode=preview";
  return POST(new Request(`http://topology.test/api/import/history${query}`, {
    method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "x-topology-project-id": project },
  }));
}

it("previews, imports and replays TestRail history with the original result and attachment", async () => {
  const native = {
    run: { id: 89, name: "Historic TestRail checkout", is_completed: true, created_on: 1700000000, completed_on: 1700000300 },
    tests: [{ id: 13, case_id: 42, title: "Checkout from the previous release" }],
    results: [{ id: 101, test_id: 13, status_id: 5, created_on: 1700000100, elapsed: "1m 2s", comment: "Cart disappeared" }],
    attachments: [{ id: 501, resultId: 101, filename: "console.log", contentType: "text/plain", dataBase64: Buffer.from("cart empty").toString("base64") }],
    expected: { results: 1, attachments: 1 },
  };
  const skipped = {
    ...native, run: { ...native.run, id: 90, name: "Source with a custom status" },
    results: [{ ...native.results[0], status_id: 11 }],
  };
  const incomplete = { ...native, run: { ...native.run, id: 91 }, expected: { results: 2, attachments: 1 } };
  const input = { provider: "testrail", sourceNamespace, runs: [native, skipped, incomplete] };
  identity.actorId = viewer;
  expect((await submit(input)).status).toBe(403);
  identity.actorId = actor;
  expect((await submit(input, "wrong-digest")).status).toBe(409);
  const preview = await (await submit(input)).json();
  expect(preview.runs).toEqual([expect.objectContaining({ sourceId: "89", state: "ready", resultCount: 1, attachmentCount: 1, unmapped: [] })]);
  expect(preview.invalid).toEqual([
    expect.objectContaining({ sourceId: "90", reason: expect.stringContaining("11") }),
    expect.objectContaining({ sourceId: "91", reason: "Expected 2 result records, found 1" }),
  ]);
  expect(await db.query.runs.findFirst({ where: and(eq(runs.workspaceId, project), eq(runs.externalId, "89")) })).toBeUndefined();

  const [first, second] = await Promise.all([submit(input, preview.digest), submit(input, preview.digest)]);
  const reports = await Promise.all([first.json(), second.json()]);
  expect(reports.map((report) => report.runs[0].state).sort()).toEqual(["imported", "unchanged"]);
  expect(reports[0].runs[0].href).toBe(reports[1].runs[0].href);
  const runId = reports[0].runs[0].href.split("/").at(-1);
  const result = await db.query.runResults.findFirst({ where: eq(runResults.runId, runId) });
  expect(result).toMatchObject({
    caseId, status: "failed", externalKey: "101", notes: "Cart disappeared", durationMs: 62000,
    executedAt: new Date(1700000100 * 1000), caseRevision: null,
    caseSnapshot: { key: "BILLING-42", title: "Checkout from the previous release" },
  });
  const files = await db.query.attachments.findMany({ where: eq(attachments.resultId, result!.id) });
  expect(files).toHaveLength(1);
  expect((await attachmentStorage.readAttachmentFile(files[0].storageKey)).toString()).toBe("cart empty");

  const changed = { ...input, runs: [{ ...native, results: [{ ...native.results[0], status_id: 1 }] }] };
  const conflict = await (await submit(changed)).json();
  expect(conflict.runs[0].state).toBe("conflict");

  const extension = { ...input, runs: [native, { ...native, run: { ...native.run, id: 92 } }] };
  const next = await (await submit(extension)).json();
  const simulateFailure = vi.spyOn(attachmentStorage, "storeAttachmentFile").mockRejectedValueOnce(new Error("Storage unavailable"));
  try {
    const incomplete = await (await submit(extension, next.digest)).json();
    expect(incomplete.runs.map((run: { state: string }) => run.state)).toEqual(["unchanged", "failed"]);
    expect(await db.query.runs.findFirst({ where: and(eq(runs.workspaceId, project), eq(runs.externalId, "92")) })).toBeUndefined();
  } finally {
    simulateFailure.mockRestore();
  }
  const resumed = await (await submit(extension, next.digest)).json();
  expect(resumed.runs.map((run: { state: string }) => run.state)).toEqual(["unchanged", "imported"]);
});

it("imports Qase history with stable case IDs and surfaces unmatched results", async () => {
  const date = "2025-09-01T00:00:00Z";
  const input = {
    provider: "qase", sourceNamespace, runs: [{
      run: { id: 89, title: "Historic Qase checkout", status_text: "passed", end_time: date },
      results: [
        { hash: "mapped-42", run_id: 89, case_id: 42, status: "passed", time_spent_ms: 14, end_time: date },
        { hash: "unmapped-60", run_id: 89, case_id: 60, status: "skipped", end_time: date },
      ],
    }],
  };
  const preview = await (await submit(input)).json();
  expect(preview.runs[0]).toMatchObject({ state: "ready", resultCount: 2, unmapped: ["60"] });
  const applied = await (await submit(input, preview.digest)).json();
  const runId = applied.runs[0].href.split("/").at(-1);
  const results = await db.query.runResults.findMany({ where: eq(runResults.runId, runId) });
  expect(results).toEqual(expect.arrayContaining([
    expect.objectContaining({ caseId, externalKey: "mapped-42", status: "passed" }),
    expect.objectContaining({ caseId: null, externalKey: "unmapped-60", status: "skipped" }),
  ]));
});
