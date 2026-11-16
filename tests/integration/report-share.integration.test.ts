/** Direct-handler tests: real PostgreSQL/transactions; auth identity mocked.
 * Browser reports.spec.ts separately proves cookies, routing and guest access. */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, users, workspaces, workspaceMembers, runs } from "@/db/schema";
import { signShareToken } from "@/lib/tcm/share-token";
import { isReportShareActive } from "@/lib/tcm/report-share";
import { POST, DELETE } from "@/app/api/reports/[id]/share/route";
import { GET } from "@/app/api/share/reports/[token]/export/route";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/auth", () => ({ auth: async () => identity.id ? { user: { id: identity.id } } : null }));
const project = randomUUID(), foreign = randomUUID();
const owner = randomUUID(), viewer = randomUUID(), run = randomUUID(), foreignRun = randomUUID();
const params = (id = run) => ({ params: Promise.resolve({ id }) });
const req = (method: string, projectId = project) => new Request(`http://localhost/api/reports/${run}/share`, {
  method, headers: { "x-topology-project-id": projectId },
});
const payload = { v: 1 as const, kind: "run" as const, workspaceId: project, targetId: run, exp: Date.now() + 60_000 };
const exportRequest = (token: string, format = "csv") => GET(new Request(`http://localhost/api/share/reports/${token}/export?format=${format}`), { params: Promise.resolve({ token }) });

describe("report share generation persistence", () => {
  beforeAll(async () => {
    await db.insert(users).values([{ id: owner, email: `${owner}@share.test` }, { id: viewer, email: `${viewer}@share.test` }]);
    await db.insert(workspaces).values([{ id: project, name: "Share", slug: project }, { id: foreign, name: "Other", slug: foreign }]);
    await db.insert(workspaceMembers).values([{ workspaceId: project, userId: owner, role: "admin" }, { workspaceId: project, userId: viewer, role: "viewer" }]);
    await db.insert(runs).values([{ id: run, workspaceId: project, name: "Shared report", status: "completed" }, { id: foreignRun, workspaceId: foreign, name: "Foreign" }]);
  });
  afterEach(() => { identity.id = ""; vi.restoreAllMocks(); });
  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, project));
    await db.delete(workspaces).where(eq(workspaces.id, foreign));
    await db.delete(users).where(eq(users.id, owner));
    await db.delete(users).where(eq(users.id, viewer));
  });
  it("rejects anonymous, viewer and cross-project revocation", async () => {
    expect((await DELETE(req("DELETE"), params())).status).toBe(401);
    identity.id = viewer;
    expect((await DELETE(req("DELETE"), params())).status).toBe(403);
    identity.id = owner;
    expect((await DELETE(req("DELETE"), params(foreignRun))).status).toBe(404);
    expect((await DELETE(req("DELETE", foreign), params(foreignRun))).status).toBe(403);
    expect((await DELETE(req("DELETE"), params("invalid"))).status).toBe(400);
  });
  it("invalidates legacy and current links, persists concurrent revocations and permits new links", async () => {
    identity.id = owner;
    const legacy = signShareToken(payload);
    const response = await POST(req("POST"), params());
    expect(response.status).toBe(200);
    const { token } = await response.json();
    expect((await exportRequest(legacy)).status).toBe(200);
    expect((await exportRequest(token)).status).toBe(200);
    expect(await isReportShareActive(payload)).toBe(true);
    const revoked = await Promise.all([DELETE(req("DELETE"), params()), DELETE(req("DELETE"), params())]);
    expect(revoked.map((r) => r.status)).toEqual([200, 200]);
    const persisted = await db.query.runs.findFirst({ where: eq(runs.id, run) });
    expect(persisted?.shareGeneration).toBe(2);
    expect(await isReportShareActive(payload)).toBe(false);
    for (const format of ["csv", "xlsx", "pdf"]) {
      expect((await exportRequest(legacy, format)).status).toBe(403);
      expect((await exportRequest(token, format)).status).toBe(403);
    }
    const issued = await POST(req("POST"), params());
    expect(issued.status).toBe(200);
    const fresh = (await issued.json()).token;
    expect((await exportRequest(fresh)).status).toBe(200);
    const audit = await db.select().from(auditEvents).where(and(eq(auditEvents.targetId, run), eq(auditEvents.action, "report.share.revoke")));
    expect(audit).toHaveLength(2);
    expect(audit.map((a) => JSON.parse(a.metadataJson!).generation).sort()).toEqual([1, 2]);
    expect(audit.every((a) => a.actorId === owner && a.workspaceId === project)).toBe(true);
  });
  it("rolls back the generation if the audit transaction fails", async () => {
    identity.id = owner;
    const before = await db.query.runs.findFirst({ where: eq(runs.id, run) });
    const original = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation((fn) => original(async (tx) => {
      vi.spyOn(tx, "insert").mockImplementation(() => { throw new Error("audit unavailable"); });
      return fn(tx);
    }));
    await expect(DELETE(req("DELETE"), params())).rejects.toThrow("audit unavailable");
    expect((await db.query.runs.findFirst({ where: eq(runs.id, run) }))?.shareGeneration).toBe(before?.shareGeneration);
  });
});
