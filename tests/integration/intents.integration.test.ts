import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Quality graph intents (integration)", () => {
  beforeAll(() => {
    process.env.DEMO_USER_EMAIL ??= "demo@topology.local";
  });

  afterEach(async () => {
    // leave demo workspace intact; delete only rows created in this suite
  });

  it("creates intent via ensureIntentForCase and backfills coverage inputs", async () => {
    const { db } = await import("@/db");
    const { cases, users, testIntents, testImplementations, requirements } =
      await import("@/db/schema");
    const { ensureMembership } = await import("@/lib/workspace");
    const { ensureIntentForCase, getWorkspaceCoverage } = await import(
      "@/lib/quality-graph"
    );

    const demo = await db.query.users.findFirst({
      where: eq(users.email, process.env.DEMO_USER_EMAIL!),
    });
    expect(demo?.id).toBeTruthy();
    const { workspace } = await ensureMembership(demo!.id, "admin");
    const workspaceId = workspace.id;
    const key = `INT-IT-${Date.now()}`;

    const [created] = await db
      .insert(cases)
      .values({
        workspaceId,
        key,
        title: "Intent integration case",
        description: "Behavior for lockout",
        steps: "1. Attempt",
        expectedResult: "Locked",
        priority: "P0",
        status: "ready",
        tags: ["integration"],
        createdById: demo!.id,
      })
      .returning();

    const { intentId, implementationId } = await ensureIntentForCase(created);
    expect(intentId).toBeTruthy();
    expect(implementationId).toBeTruthy();

    const intent = await db.query.testIntents.findFirst({
      where: and(
        eq(testIntents.id, intentId),
        eq(testIntents.workspaceId, workspaceId),
      ),
    });
    expect(intent?.key).toBe(key);
    expect(intent?.behavior).toContain("lockout");

    const impl = await db.query.testImplementations.findFirst({
      where: eq(testImplementations.id, implementationId),
    });
    expect(impl?.type).toBe("manual");
    expect(impl?.caseId).toBe(created.id);

    const linked = await db.query.cases.findFirst({
      where: eq(cases.id, created.id),
    });
    expect(linked?.intentId).toBe(intentId);

    // Idempotent
    const again = await ensureIntentForCase({ ...created, intentId });
    expect(again.intentId).toBe(intentId);
    expect(again.implementationId).toBe(implementationId);

    const coverage = await getWorkspaceCoverage(workspaceId);
    expect(coverage.automation.total).toBeGreaterThan(0);
    expect(Array.isArray(coverage.gaps)).toBe(true);

    // cleanup
    await db.delete(testImplementations).where(eq(testImplementations.id, implementationId));
    await db.update(cases).set({ intentId: null }).where(eq(cases.id, created.id));
    await db.delete(testIntents).where(eq(testIntents.id, intentId));
    await db.delete(cases).where(eq(cases.id, created.id));
    void requirements;
  });

  it("POST /api/agent create_test_intent + get coverage resource", async () => {
    const { POST, GET } = await import("@/app/api/agent/route");
    const { db } = await import("@/db");
    const { testIntents } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    process.env.TOPOLOGY_API_TOKEN ??= "topo_demo_token_local_dev_only";
    const auth = {
      Authorization: `Bearer ${process.env.TOPOLOGY_API_TOKEN}`,
    };
    const key = `MCP-IT-${Date.now()}`;

    const createRes = await POST(
      new Request("http://127.0.0.1/api/agent", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_test_intent",
          key,
          title: "MCP intent",
          behavior: "Agent-created",
          criticality: "P1",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { intent?: { id: string; key: string } };
    expect(created.intent?.key).toBe(key);

    const getRes = await GET(
      new Request(
        `http://127.0.0.1/api/agent?resource=intents&key=${encodeURIComponent(key)}`,
        { headers: auth },
      ),
    );
    expect(getRes.status).toBe(200);

    const coverageRes = await GET(
      new Request("http://127.0.0.1/api/agent?resource=coverage", {
        headers: auth,
      }),
    );
    expect(coverageRes.status).toBe(200);
    const coverageData = (await coverageRes.json()) as {
      coverage?: { execution?: { total: number } };
    };
    expect(coverageData.coverage?.execution?.total).toBeGreaterThan(0);

    if (created.intent?.id) {
      await db.delete(testIntents).where(eq(testIntents.id, created.intent.id));
    }
  });
});
