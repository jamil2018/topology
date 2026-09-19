import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetMockIssueStore } from "@topology/issue-providers";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Issues + agent MCP surface (integration)", () => {
  beforeAll(() => {
    process.env.TOPOLOGY_API_TOKEN ??= "topo_demo_token_local_dev_only";
    process.env.DEMO_USER_EMAIL ??= "demo@topology.local";
    process.env.TOPOLOGY_ISSUE_PROVIDER = "mock";
  });

  afterEach(() => {
    resetMockIssueStore();
    vi.restoreAllMocks();
  });

  it("createIssueFromResult files a mock issue for a failed result", async () => {
    const { db } = await import("@/db");
    const { runs, runResults, cases, users } = await import("@/db/schema");
    const { createIssueFromResult } = await import("@/lib/issues");
    const { ensureMembership } = await import("@/lib/workspace");

    const demo = await db.query.users.findFirst({
      where: eq(users.email, process.env.DEMO_USER_EMAIL!),
    });
    expect(demo?.id).toBeTruthy();
    const { workspace } = await ensureMembership(demo!.id, "admin");
    const workspaceId = workspace.id;

    const [run] = await db
      .insert(runs)
      .values({
        workspaceId,
        name: `Issue integration ${Date.now()}`,
        kind: "manual",
        status: "in_progress",
        environment: "local",
        createdById: demo!.id,
        startedAt: new Date(),
      })
      .returning();

    let seededCase = await db.query.cases.findFirst({
      where: eq(cases.workspaceId, workspaceId),
    });
    if (!seededCase) {
      const [created] = await db
        .insert(cases)
        .values({
          workspaceId,
          key: `TOP-INT-${Date.now()}`,
          title: "Integration failure case",
          description: "",
          steps: "1. Break",
          expectedResult: "pass",
          priority: "P1",
          status: "ready",
          tags: ["integration"],
          createdById: demo!.id,
        })
        .returning();
      seededCase = created;
    }

    const [result] = await db
      .insert(runResults)
      .values({
        runId: run.id,
        caseId: seededCase.id,
        status: "failed",
        notes: "blank screen",
        executedById: demo!.id,
        executedAt: new Date(),
      })
      .returning();

    const issue = await createIssueFromResult({
      resultId: result.id,
      provider: "mock",
      userId: demo!.id,
    });

    expect(issue.provider).toBe("mock");
    expect(issue.remoteKey).toMatch(/^MOCK-/);
    expect(issue.resultId).toBe(result.id);
  });

  it("rejects issue create for non-failed results", async () => {
    const { db } = await import("@/db");
    const { runs, runResults, cases, users } = await import("@/db/schema");
    const { createIssueFromResult } = await import("@/lib/issues");
    const { ensureMembership } = await import("@/lib/workspace");

    const demo = await db.query.users.findFirst({
      where: eq(users.email, process.env.DEMO_USER_EMAIL!),
    });
    const { workspace } = await ensureMembership(demo!.id, "admin");
    const workspaceId = workspace.id;
    const anyCase = await db.query.cases.findFirst({
      where: eq(cases.workspaceId, workspaceId),
    });
    expect(anyCase).toBeTruthy();

    const [run] = await db
      .insert(runs)
      .values({
        workspaceId,
        name: `Passed result ${Date.now()}`,
        kind: "manual",
        status: "in_progress",
        environment: "local",
        createdById: demo!.id,
        startedAt: new Date(),
      })
      .returning();

    const [result] = await db
      .insert(runResults)
      .values({
        runId: run.id,
        caseId: anyCase!.id,
        status: "passed",
        notes: "",
        executedById: demo!.id,
        executedAt: new Date(),
      })
      .returning();

    await expect(
      createIssueFromResult({
        resultId: result.id,
        provider: "mock",
        userId: demo!.id,
      }),
    ).rejects.toThrow(/failed or blocked/i);
  });

  it("authenticateCiRequest accepts env token and rejects bad tokens", async () => {
    const { authenticateCiRequest } = await import("@/lib/ci-auth");
    const bad = await authenticateCiRequest(
      new Request("http://x", {
        headers: { Authorization: "Bearer not-a-real-token" },
      }),
    );
    expect(bad.ok).toBe(false);

    const good = await authenticateCiRequest(
      new Request("http://x", {
        headers: {
          Authorization: `Bearer ${process.env.TOPOLOGY_API_TOKEN}`,
        },
      }),
    );
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.userId).toBeTruthy();
  });

  it("agent API lists cases with bearer auth (MCP tools backend)", async () => {
    const { GET } = await import("@/app/api/agent/route");
    const res = await GET(
      new Request("http://127.0.0.1/api/agent?resource=cases&q=hub", {
        headers: {
          Authorization: `Bearer ${process.env.TOPOLOGY_API_TOKEN}`,
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cases?: unknown[] };
    expect(Array.isArray(data.cases)).toBe(true);
  });

  it("agent API lists intents and coverage", async () => {
    const { GET, POST } = await import("@/app/api/agent/route");
    const auth = {
      Authorization: `Bearer ${process.env.TOPOLOGY_API_TOKEN}`,
    };

    const listRes = await GET(
      new Request("http://127.0.0.1/api/agent?resource=intents", {
        headers: auth,
      }),
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as { intents?: unknown[] };
    expect(Array.isArray(listData.intents)).toBe(true);

    const coverageRes = await GET(
      new Request("http://127.0.0.1/api/agent?resource=coverage", {
        headers: auth,
      }),
    );
    expect(coverageRes.status).toBe(200);
    const coverageData = (await coverageRes.json()) as {
      coverage?: { requirement?: { total: number }; gaps?: unknown[] };
    };
    expect(coverageData.coverage).toBeTruthy();
    expect(typeof coverageData.coverage?.requirement?.total).toBe("number");
    expect(Array.isArray(coverageData.coverage?.gaps)).toBe(true);

    const key = `MCP-INT-${Date.now()}`;
    const createRes = await POST(
      new Request("http://127.0.0.1/api/agent", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_test_intent",
          key,
          title: "Agent-created intent",
          criticality: "P2",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { intent?: { key: string } };
    expect(created.intent?.key).toBe(key);

    const getRes = await GET(
      new Request(
        `http://127.0.0.1/api/agent?resource=intents&key=${encodeURIComponent(key)}`,
        { headers: auth },
      ),
    );
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as { intent?: { key: string } };
    expect(detail.intent?.key).toBe(key);
  });

  it("agent API rejects missing bearer tokens", async () => {
    const { GET } = await import("@/app/api/agent/route");
    const res = await GET(
      new Request("http://127.0.0.1/api/agent?resource=cases"),
    );
    expect(res.status).toBe(401);
  });
});
