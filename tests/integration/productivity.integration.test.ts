import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { cases, sharedSteps, sharedStepItems, users, workspaces, workspaceMembers, runs, runResults, retestSources, notifications, workspaceRoles } from "@/db/schema";
import { listRunsPage } from "@/lib/queries/list-runs";
import * as caseRoutes from "@/app/api/cases/route";
import * as caseDetail from "@/app/api/cases/[id]/route";
import * as projectRoutes from "@/app/api/projects/route";
import * as proposalRoutes from "@/app/api/proposals/route";
import * as runRoutes from "@/app/api/runs/route";
import * as sharedStepRoutes from "@/app/api/shared-steps/[id]/route";
import * as caseTcm from "@/lib/tcm/case-tcm";
import * as templates from "@/app/api/run-templates/route";
import * as templateDetail from "@/app/api/run-templates/[id]/route";
import * as retest from "@/app/api/runs/retest/route";
import * as views from "@/app/api/views/route";
import * as viewDetail from "@/app/api/views/[id]/route";
import * as runDetail from "@/app/api/runs/[id]/route";
import * as caseLink from "@/app/api/results/[id]/case/route";
import * as notificationOpen from "@/app/api/notifications/[id]/open/route";
import * as seed from "@/lib/tcm/seed-run";
import { persistCsvCases } from "@/lib/import/csv-import";
import { findOrCreateCaseForExternal } from "@/lib/ci-ingest";
const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/auth", () => ({ auth: async () => identity.id ? { user: { id: identity.id } } : null }));
const project = randomUUID(), foreign = randomUUID();
const ids = { admin: randomUUID(), member: randomUUID(), viewer: randomUUID(), custom: randomUUID(), outsider: randomUUID() };
const caseId = randomUUID(), foreignCase = randomUUID(), runId = randomUUID(), resultId = randomUUID(), unlinkedId = randomUUID();
function request(path: string, method = "GET", body?: unknown, workspaceId = project) { return new Request(`http://localhost/api/${path}`, { method, headers: { "Content-Type": "application/json", "x-topology-project-id": workspaceId }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
function params(id: string) { return { params: Promise.resolve({ id }) }; }
const input = { name: "Smoke template", caseIds: [caseId], environment: "staging", assigneeId: ids.member };

describe("QA productivity access and lineage", () => {
  beforeAll(async () => {
    await db.insert(users).values(Object.entries(ids).map(([role, id]) => ({ id, email: `${id}@productivity.test`, name: role })));
    await db.insert(workspaces).values([{ id: project, slug: `productivity-${project}`, name: "Productivity" }, { id: foreign, slug: `foreign-${foreign}`, name: "Foreign" }]);
    const [role] = await db.insert(workspaceRoles).values({ workspaceId: project, name: "Run author", actions: ["runs.view", "runs.create"] }).returning();
    await db.insert(workspaceMembers).values([{ workspaceId: project, userId: ids.admin, role: "admin" }, { workspaceId: project, userId: ids.member, role: "member" }, { workspaceId: project, userId: ids.viewer, role: "viewer" }, { workspaceId: project, userId: ids.custom, role: "viewer", customRoleId: role.id }, { workspaceId: foreign, userId: ids.outsider, role: "admin" }]);
    await db.insert(cases).values([{ id: caseId, workspaceId: project, key: "QA-1", title: "Checkout", status: "ready" }, { id: foreignCase, workspaceId: foreign, key: "X-1", title: "Foreign case" }]);
    await db.insert(runs).values({ id: runId, workspaceId: project, name: "Source", status: "in_progress" });
    await db.insert(runResults).values([{ id: resultId, runId, caseId, status: "failed" }, { id: unlinkedId, runId, status: "blocked", title: "Unmapped automation" }]);
  });
  afterEach(() => { vi.restoreAllMocks(); identity.id = ""; });
  afterAll(async () => { await db.delete(workspaces).where(inArray(workspaces.id, [project, foreign])); await db.delete(users).where(inArray(users.id, Object.values(ids))); });

  it("ignores malformed assignee filters without sending invalid UUIDs to Postgres", async () => {
    await expect(listRunsPage(project, {assignee:"a".repeat(36)})).resolves.toHaveProperty("items");
    await expect(listRunsPage(project, {assignee:"-".repeat(36)})).resolves.toHaveProperty("items");
  });

  it("creates structured steps atomically and rolls back a rejected step write", async () => {
    identity.id = ids.admin;
    const input = { key: "ATOMIC-1", title: "Atomic authoring", structuredSteps: [{ action: "Open checkout", expected: "Checkout appears", data: "" }] };
    const created = await caseRoutes.POST(request("cases", "POST", input));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.case.steps).toContain("Open checkout");
    const stored = await db.query.caseSteps.findMany({ where: (step, { eq }) => eq(step.caseId, body.case.id) });
    expect(stored).toHaveLength(1);
    vi.spyOn(caseTcm, "replaceCaseSteps").mockRejectedValueOnce(new Error("Simulated storage failure"));
    const rejected = await caseRoutes.POST(request("cases", "POST", { ...input, key: "ATOMIC-2" }));
    expect(rejected.status).toBe(500);
    expect(await db.query.cases.findFirst({ where: and(eq(cases.workspaceId, project), eq(cases.key, "ATOMIC-2")) })).toBeUndefined();
  });

  it("requires the assigned reviewer and keeps the approved revision executable until a proposal is accepted", async () => {
    const policy = request("projects", "PATCH", { id: project, requireCaseReview: true });
    identity.id = ids.member;
    expect((await projectRoutes.PATCH(policy)).status).toBe(403);
    identity.id = ids.admin;
    expect((await projectRoutes.PATCH(request("projects", "PATCH", { id: project, requireCaseReview: true }))).status).toBe(200);
    try {
      const [shared] = await db.insert(sharedSteps).values({ workspaceId: project, name: "Connect" }).returning();
      await db.insert(sharedStepItems).values({ sharedStepId: shared.id, position: 0, action: "Connect to checkout" });
      identity.id = ids.member;
      const imported = await persistCsvCases({
        workspaceId: project, actorId: ids.member, dryRun: false,
        rows: [{ key: "REVIEW-CSV", title: "Imported checkout", priority: "P2", status: "ready",
          description: "", preconditions: "", steps: "", expectedResult: "", folder: "", tags: "" }],
      });
      const automated = await findOrCreateCaseForExternal({
        externalKey: "review-policy-test", name: "Discovered checkout", classname: "review",
        status: "passed", durationMs: 2, notes: "",
      }, ids.member, project);
      expect(imported.created).toHaveLength(1);
      const discovered = await db.select({ status: cases.status }).from(cases)
        .where(inArray(cases.id, [imported.created[0].id, automated.caseId]));
      expect(discovered).toEqual([{ status: "draft" }, { status: "draft" }]);
      const initial = { key: "REVIEW-1", title: "Checkout recovers", structuredSteps: [{ action: "Connect", sharedStepId: shared.id }] };
      expect((await caseRoutes.POST(request("cases", "POST", { ...initial, status: "ready" }))).status).toBe(409);
      const created = await caseRoutes.POST(request("cases", "POST", initial));
      expect(created.status).toBe(201);
      const { case: { id } } = await created.json();
      const patch = (data: unknown) => caseDetail.PATCH(request(`cases/${id}`, "PATCH", data), params(id));
      const startRun = () => runRoutes.POST(request("runs", "POST", { name: "Review test", caseIds: [id] }));
      expect((await patch({ status: "ready" })).status).toBe(409);
      expect((await startRun()).status).toBe(409);
      expect((await caseRoutes.PATCH(request("cases", "PATCH", { caseIds: [caseId, id], status: "ready", tags: ["unchecked"] }))).status).toBe(409);
      const submitted = await patch({ status: "in_review", reviewerId: ids.admin });
      expect(submitted.status).toBe(200);
      const review = (await submitted.json()).case;
      expect((await sharedStepRoutes.PATCH(
        request(`shared-steps/${shared.id}`, "PATCH", { items: [{ action: "Replace in-place" }] }),
        params(shared.id),
      )).status).toBe(409);
      expect((await patch({ status: "ready", expectedRevision: review.revision })).status).toBe(403);
      expect((await patch({ title: "Changed during review" })).status).toBe(409);

      identity.id = ids.admin;
      expect((await patch({ status: "ready", expectedRevision: "0".repeat(64) })).status).toBe(409);
      expect((await patch({ status: "ready", expectedRevision: review.revision, title: "Unreviewed changes" })).status).toBe(409);
      const approval = await patch({ status: "ready", expectedRevision: review.revision });
      expect(approval.status).toBe(200);
      const ready = (await approval.json()).case;
      expect(ready.title).toBe(initial.title);

      identity.id = ids.member;
      const edit = { title: "Checkout preserves the cart", expectedRevision: ready.revision };
      const [first, replay] = await Promise.all([patch(edit), patch(edit)]);
      expect(first.status).toBe(202);
      expect(replay.status).toBe(202);
      const receipt = await first.json();
      expect(await replay.json()).toEqual(receipt);
      expect((await startRun()).status).toBe(201);
      expect((await sharedStepRoutes.DELETE(request(`shared-steps/${shared.id}`, "DELETE"), params(shared.id))).status).toBe(409);
      expect(await db.query.cases.findFirst({ where: eq(cases.id, id) })).toMatchObject({ status: "ready", title: initial.title });
      const accept = () => proposalRoutes.PATCH(request("proposals", "PATCH", { id: receipt.proposalId, status: "accepted" }));
      identity.id = ids.viewer;
      expect((await accept()).status).toBe(403);
      identity.id = ids.admin;
      expect((await accept()).status).toBe(200);
      expect(await db.query.cases.findFirst({ where: eq(cases.id, id) })).toMatchObject({ status: "ready", title: edit.title });
    } finally {
      identity.id = ids.admin;
      expect((await projectRoutes.PATCH(request("projects", "PATCH", { id: project, requireCaseReview: false }))).status).toBe(200);
    }
  });
  it("allows authors, denies viewers, and keeps template references project-scoped", async () => {
    expect((await templates.POST(request("run-templates", "POST", input))).status).toBe(401);
    identity.id = ids.viewer;
    expect((await templates.POST(request("run-templates", "POST", input))).status).toBe(403);
    identity.id = ids.custom;
    const created = await templates.POST(request("run-templates", "POST", { ...input, assigneeId: null }));
    expect(created.status).toBe(201);
    const { template } = await created.json();
    identity.id = ids.member;
    expect((await templateDetail.PATCH(request(`run-templates/${template.id}`, "PATCH", input), params(template.id))).status).toBe(403);
    identity.id = ids.admin;
    expect((await templateDetail.PATCH(request(`run-templates/${template.id}`, "PATCH", input), params(template.id))).status).toBe(200);
    expect((await templates.POST(request("run-templates", "POST", { ...input, caseIds: [foreignCase] }))).status).toBe(400);
    identity.id = ids.outsider;
    expect((await templateDetail.GET(request(`run-templates/${template.id}`, "GET", undefined, foreign), params(template.id))).status).toBe(404);
  });
  it("retains unavailable template case references for explicit correction", async () => {
    identity.id = ids.admin;
    const extra = randomUUID(); await db.insert(cases).values({ id: extra, workspaceId: project, key: "QA-2", title: "Temporary" });
    const response = await templates.POST(request("run-templates", "POST", { ...input, caseIds: [extra] }));
    const { template } = await response.json();
    await db.delete(cases).where(eq(cases.id, extra));
    const read = await (await templateDetail.GET(request(`run-templates/${template.id}`), params(template.id))).json();
    expect(read.template.caseIds).toEqual([extra]); expect(read.warning).toContain("unavailable");
  });
  it("keeps private views private and permits team administration", async () => {
    identity.id = ids.member;
    const privateView = await (await views.POST(request("views", "POST", { name: "Private", entity: "runs", config: {} }))).json();
    const shared = await (await views.POST(request("views", "POST", { name: "Team", entity: "runs", visibility: "team", config: { status: "in_progress", kind: "manual" } }))).json();
    identity.id = ids.viewer;
    const read = await (await views.GET(request("views?entity=runs"))).json();
    expect(read.views.map((view: { id: string }) => view.id)).toContain(shared.view.id);
    expect(read.views.map((view: { id: string }) => view.id)).not.toContain(privateView.view.id);
    expect((await viewDetail.DELETE(request(`views/${shared.view.id}`, "DELETE"), params(shared.view.id))).status).toBe(403);
    identity.id = ids.admin;
    expect((await viewDetail.DELETE(request(`views/${privateView.view.id}`, "DELETE"), params(privateView.view.id))).status).toBe(403);
    expect((await viewDetail.DELETE(request(`views/${shared.view.id}`, "DELETE"), params(shared.view.id))).status).toBe(200);
  });
  it("creates untested retests with lineage while preserving original failures", async () => {
    identity.id = ids.member;
    const preview = await (await retest.GET(request(`runs/retest?results=${resultId},${unlinkedId}`))).json();
    expect(preview.eligible).toHaveLength(1); expect(preview.excluded).toHaveLength(1);
    expect((await retest.POST(request("runs/retest", "POST", { name: "Invalid", sourceResultIds: [unlinkedId] }))).status).toBe(409);
    const response = await retest.POST(request("runs/retest", "POST", { name: "Retest", sourceResultIds: [resultId, resultId] }));
    expect(response.status).toBe(201);
    const { run } = await response.json();
    const created = await db.select().from(runResults).where(eq(runResults.runId, run.id));
    expect(created).toHaveLength(1); expect(created[0].status).toBe("untested");
    const lineage = await db.select().from(retestSources).where(eq(retestSources.resultId, created[0].id));
    expect(lineage).toHaveLength(1); expect(lineage[0].sourceResultId).toBe(resultId);
    expect((await db.select().from(runResults).where(eq(runResults.id, resultId)))[0].status).toBe("failed");
  });
  it("links unmapped failures without rewriting historical results", async () => {
    identity.id = ids.viewer;
    expect((await caseLink.POST(request(`results/${unlinkedId}/case`, "POST", { caseId }), params(unlinkedId))).status).toBe(403);
    identity.id = ids.admin;
    expect((await caseLink.POST(request(`results/${unlinkedId}/case`, "POST", { caseId: foreignCase }), params(unlinkedId))).status).toBe(404);
    expect((await caseLink.POST(request(`results/${unlinkedId}/case`, "POST", { caseId }), params(unlinkedId))).status).toBe(200);
    const original = await db.query.runResults.findFirst({ where: eq(runResults.id, unlinkedId) });
    expect(original?.caseId).toBeNull(); expect(original?.status).toBe("blocked");
    const preview = await (await retest.GET(request(`runs/retest?results=${unlinkedId}`))).json();
    expect(preview.caseIds).toEqual([caseId]); expect(preview.excluded).toEqual([]);
  });
  it("opens handoffs in their project and rejects another user's notification", async () => {
    const [notice] = await db.insert(notifications).values({ workspaceId: project, userId: ids.member, type: "assignment", title: "Assigned", entityType: "result", entityId: resultId }).returning();
    identity.id = ids.member;
    const response = await notificationOpen.GET(request(`notifications/${notice.id}/open`), params(notice.id));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(`/runs/${runId}?result=${resultId}`);
    expect(response.headers.get("set-cookie")).toContain(project);
    identity.id = ids.viewer;
    expect((await notificationOpen.GET(request(`notifications/${notice.id}/open`), params(notice.id))).status).toBe(404);
    await db.delete(notifications).where(eq(notifications.id, notice.id));
  });
  it("rolls back the run if result snapshot creation fails", async () => {
    identity.id = ids.admin;
    vi.spyOn(seed, "seedManualRunResults").mockRejectedValueOnce(new Error("snapshot failure"));
    await expect(retest.POST(request("runs/retest", "POST", { name: "Rollback probe", sourceResultIds: [resultId] }))).rejects.toThrow("snapshot failure");
    expect(await db.select().from(runs).where(and(eq(runs.workspaceId, project), eq(runs.name, "Rollback probe")))).toHaveLength(0);
  });
  it("notifies only a changed recipient and resolves result handoffs", async () => {
    identity.id = ids.admin;
    for (let repeat = 0; repeat < 2; repeat++) expect((await runDetail.PATCH(request(`runs/${runId}`, "PATCH", { action: "assign_result", resultId, assigneeId: ids.member }), params(runId))).status).toBe(200);
    const inbox = await db.select().from(notifications).where(and(eq(notifications.workspaceId, project), eq(notifications.userId, ids.member), eq(notifications.entityId, resultId)));
    expect(inbox).toHaveLength(1);
    const { listNotificationsForUser } = await import("@/lib/notifications");
    expect((await listNotificationsForUser(ids.member, project)).find((item) => item.id === inbox[0].id)?.href).toBe(`/runs/${runId}?result=${resultId}`);
  });
});
