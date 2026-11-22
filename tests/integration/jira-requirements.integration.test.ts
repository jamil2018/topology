import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents, components, jiraRequirementRevisions, qualityEdges, requirements, testIntents, users, workspaceMembers, workspaces,
} from "@/db/schema";
import { POST as receive } from "@/app/api/webhooks/requirements/jira/route";
import { GET as history, POST as change } from "@/app/api/requirements/[id]/jira/route";
import { GET as list, PATCH as edit } from "@/app/api/requirements/route";
import { POST as affected } from "@/app/api/affected/route";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: identity.id } }) }));

const project = randomUUID();
const foreign = randomUUID();
const admin = randomUUID();
const member = randomUUID();
const viewer = randomUUID();
const foreignAdmin = randomUUID();
const requirementId = randomUUID();
const otherRequirementId = randomUUID();
const intentId = randomUUID();
const edgeId = randomUUID();
const componentId = randomUUID();
const origin = "https://sandbox.atlassian.net";
const secret = "local-jira-integration-fixture-secret";
const foreignSecret = "separate-local-jira-fixture-secret";
const issueId = "10222";
const date = "2026-01-25T00:00:00.000+0000";
const later = "2026-01-25T00:02:00.000+0000";
const latest = "2026-01-25T00:04:00.000+0000";

beforeAll(async () => {
  vi.stubEnv("TOPOLOGY_JIRA_REQUIREMENT_TARGETS", JSON.stringify([
    { workspaceId: project, origin, projectId: "10001", secretEnv: "TOPOLOGY_JIRA_REQUIREMENT_SECRET_LOCAL_FIXTURE" },
    { workspaceId: foreign, origin, projectId: "20002", secretEnv: "TOPOLOGY_JIRA_REQUIREMENT_SECRET_FOREIGN_FIXTURE" },
  ]));
  vi.stubEnv("TOPOLOGY_JIRA_REQUIREMENT_SECRET_LOCAL_FIXTURE", secret);
  vi.stubEnv("TOPOLOGY_JIRA_REQUIREMENT_SECRET_FOREIGN_FIXTURE", foreignSecret);
  await db.insert(users).values([admin, member, viewer, foreignAdmin].map((id) => ({ id, email: `${id}@jira.test` })));
  await db.insert(workspaces).values([project, foreign].map((id) => ({ id, slug: `jira-${id}`, name: "Jira fixture" })));
  await db.insert(workspaceMembers).values([
    { workspaceId: project, userId: admin, role: "admin" },
    { workspaceId: project, userId: member, role: "member" },
    { workspaceId: project, userId: viewer, role: "viewer" },
    { workspaceId: foreign, userId: foreignAdmin, role: "admin" },
  ]);
  await db.insert(requirements).values([
    { id: requirementId, workspaceId: project, key: "REQ-CART", title: "Local Cart", criticality: "P0" },
    { id: otherRequirementId, workspaceId: project, key: "REQ-OTHER", title: "Other Requirement" },
  ]);
  await db.insert(components).values({ id: componentId, workspaceId: project, key: "CART", title: "Cart component" });
  await db.insert(testIntents).values({ id: intentId, workspaceId: project, key: "CART-TEST", title: "Check cart" });
  await db.insert(qualityEdges).values([
    { id: edgeId, workspaceId: project, fromType: "requirement", fromId: requirementId, toType: "intent", toId: intentId, relation: "covers" },
    { workspaceId: project, fromType: "requirement", fromId: requirementId, toType: "component", toId: componentId, relation: "belongs_to" },
  ]);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.delete(workspaces).where(inArray(workspaces.id, [project, foreign]));
  await db.delete(users).where(inArray(users.id, [admin, member, viewer, foreignAdmin]));
});

function request(endpoint: string, method: string, payload?: unknown, workspaceId = project) {
  return new Request(`https://topology.test/api/${endpoint}`, {
    method, headers: { "x-topology-project-id": workspaceId, "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

function mutate(payload: unknown, id = requirementId, workspaceId = project) {
  return change(request(`requirements/${id}/jira`, "POST", payload, workspaceId), { params: Promise.resolve({ id }) });
}

function jiraEvent(updated: string, summary: string) {
  return { webhookEvent: "jira:issue_updated", issue: {
    id: issueId, key: "CART-12", self: `${origin}/rest/api/2/issue/${issueId}`,
    fields: { project: { id: "10001" }, updated, summary, description: {
      type: "doc", version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Cart must retain items." }] }],
    } },
  } };
}

function deliver(event: unknown, workspaceId = project, signingSecret = secret) {
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", signingSecret).update(body).digest("hex");
  return receive(new Request(`https://topology.test/api/webhooks/requirements/jira?workspaceId=${workspaceId}`, {
    method: "POST", headers: { "x-hub-signature": `sha256=${signature}` }, body,
  }));
}

it("binds a Jira issue with admin approval and reconciles source revisions and exact link reviews", async () => {
  expect((await deliver(jiraEvent(date, "Cart validation"), project, "incorrect-secret")).status).toBe(401);
  expect((await deliver(jiraEvent(date, "Cart validation"), foreign)).status).toBe(401);
  expect(await (await deliver(jiraEvent(date, "Cart validation"), foreign, foreignSecret)).json()).toEqual({ status: "unmatched" });
  expect(await (await deliver(jiraEvent(date, "Cart validation"))).json()).toEqual({ status: "unmapped" });
  identity.id = member;
  expect((await mutate({ action: "bind", issueId })).status).toBe(403);
  identity.id = admin;
  expect((await mutate({ action: "bind", issueId })).status).toBe(200);
  expect(await (await mutate({ action: "bind", issueId })).json()).toMatchObject({ status: "unchanged" });
  expect((await mutate({ action: "bind", issueId }, otherRequirementId)).status).toBe(409);
  identity.id = foreignAdmin;
  expect((await mutate({ action: "bind", issueId }, requirementId, foreign)).status).toBe(404);

  const [first, reissued] = await Promise.all([
    deliver(jiraEvent(date, "Cart validation")), deliver(jiraEvent(date, "Cart validation")),
  ]);
  const deliveries = await Promise.all([first.json(), reissued.json()]);
  expect(deliveries.map((delivery) => delivery.status).sort()).toEqual(["unchanged", "updated"]);
  const revisions = await db.query.jiraRequirementRevisions.findMany({
    where: eq(jiraRequirementRevisions.requirementId, requirementId),
  });
  expect(revisions).toEqual([expect.objectContaining({ revision: 1, title: "Cart validation", description: "Cart must retain items." })]);

  identity.id = viewer;
  const rows = (await (await list(request("requirements", "GET"))).json()).requirements;
  expect(rows).toContainEqual(expect.objectContaining({
    id: requirementId, key: "REQ-CART", title: "Cart validation", criticality: "P0",
    jira: expect.objectContaining({ issueId, revision: 1, href: `${origin}/browse/CART-12` }),
    coverageLinks: [expect.objectContaining({ edgeId, suspect: true, reviewedJiraRevision: 0 })],
  }));
  const impact = await (await affected(request("affected", "POST", {
    paths: ["src/cart/checkout.ts"], rules: [{ pattern: "src/cart/", componentKey: "CART" }],
  }))).json();
  expect(impact.suspectCoverageLinks).toEqual([expect.objectContaining({ edgeId, intentKey: "CART-TEST", jiraRevision: 1 })]);
  expect((await mutate({ action: "review", edgeId, revision: 1 })).status).toBe(403);

  identity.id = member;
  expect(await (await mutate({ action: "review", edgeId, revision: 1 })).json()).toEqual({ status: "reviewed" });
  expect(await (await mutate({ action: "review", edgeId, revision: 1 })).json()).toEqual({ status: "unchanged" });
  expect((await edit(request("requirements", "PATCH", { id: requirementId, title: "Direct edit" }))).status).toBe(409);
  expect((await edit(request("requirements", "PATCH", { id: requirementId, criticality: "P1", coversIntentIds: [intentId] }))).status).toBe(200);
  expect(await db.query.qualityEdges.findFirst({ where: eq(qualityEdges.id, edgeId) })).toMatchObject({ reviewedJiraRevision: 1 });

  expect(await (await deliver(jiraEvent(later, "Cart validation"))).json()).toEqual({ status: "unchanged", revision: 1 });
  expect(await (await deliver(jiraEvent(date, "Stale content"))).json()).toEqual({ status: "stale", revision: 1 });
  expect((await deliver(jiraEvent(later, "Conflicting content"))).status).toBe(409);
  expect(await (await deliver(jiraEvent(latest, "Cart validation updated"))).json()).toEqual({ status: "updated", revision: 2 });
  expect((await mutate({ action: "review", edgeId, revision: 1 })).status).toBe(409);
  expect(await (await mutate({ action: "review", edgeId, revision: 2 })).json()).toEqual({ status: "reviewed" });
  identity.id = viewer;
  const params = { params: Promise.resolve({ id: requirementId }) };
  const endpoint = `requirements/${requirementId}/jira`;
  const revisionHistory = await (await history(request(endpoint, "GET"), params)).json();
  expect(revisionHistory.revisions.map((entry: { revision: number }) => entry.revision)).toEqual([2, 1]);
  const earlierRevision = await (await history(request(`${endpoint}?beforeRevision=2`, "GET"), params)).json();
  expect(earlierRevision.revisions).toEqual([expect.objectContaining({ revision: 1, title: "Cart validation" })]);
  identity.id = foreignAdmin;
  expect((await history(request(endpoint, "GET", undefined, foreign), params)).status).toBe(404);
  const records = await db.query.auditEvents.findMany({
    where: and(eq(auditEvents.workspaceId, project), eq(auditEvents.targetId, requirementId)),
  });
  expect(records.map((record) => record.action).sort()).toEqual([
    "requirement.jira.bind", "requirement.jira.review_coverage", "requirement.jira.review_coverage",
    "requirement.jira.sync", "requirement.jira.sync",
  ]);
});
