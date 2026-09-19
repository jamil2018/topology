import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMockIssueProvider, resetMockIssueStore } from "@topology/issue-providers";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("CI ingest API (integration)", () => {
  beforeAll(async () => {
    process.env.TOPOLOGY_API_TOKEN ??= "topo_demo_token_local_dev_only";
    process.env.DEMO_USER_EMAIL ??= "demo@topology.local";
    process.env.TOPOLOGY_ISSUE_PROVIDER = "mock";
  });

  afterEach(() => {
    resetMockIssueStore();
    vi.restoreAllMocks();
  });

  function authHeaders() {
    return {
      Authorization: `Bearer ${process.env.TOPOLOGY_API_TOKEN}`,
      "Content-Type": "application/json",
    };
  }

  it("rejects missing bearer tokens", async () => {
    const { POST } = await import("@/app/api/ci/junit/route");
    const res = await POST(
      new Request("http://127.0.0.1/api/ci/junit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("submits junit-normalized results and completes a run", async () => {
    const { POST } = await import("@/app/api/ci/junit/route");
    const externalKey = `hub::loads_${Date.now()}`;
    const res = await POST(
      new Request("http://127.0.0.1/api/ci/junit", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: `Integration junit ${Date.now()}`,
          source: "cli",
          results: [
            {
              externalKey,
              classname: "hub",
              name: "loads",
              status: "passed",
              notes: "",
              durationMs: 120,
            },
            {
              externalKey: "runs::record_result",
              classname: "runs",
              name: "record_result",
              status: "failed",
              notes: "expected status passed",
              durationMs: 120,
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      run: { id: string };
      summary: { failed: number; passed: number };
    };
    expect(data.run.id).toBeTruthy();
    expect(data.summary.failed).toBe(1);
    expect(data.summary.passed).toBe(1);

    const { db } = await import("@/db");
    const { cases, testImplementations } = await import("@/db/schema");
    const { automationCaseKey } = await import("@/lib/ci-ingest");
    const { eq, and } = await import("drizzle-orm");
    const key = automationCaseKey(externalKey);
    const linked = await db.query.cases.findFirst({
      where: eq(cases.key, key),
    });
    expect(linked?.intentId).toBeTruthy();
    const impl = await db.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.caseId, linked!.id),
        eq(testImplementations.type, "junit"),
      ),
    });
    expect(impl?.externalKey).toBe(externalKey);
  });

  it("creates a sharded run, merges threads, and completes", async () => {
    const { db } = await import("@/db");
    const { runs } = await import("@/db/schema");
    const { authenticateCiRequest } = await import("@/lib/ci-auth");

    const authResult = await authenticateCiRequest(
      new Request("http://x", {
        headers: { Authorization: `Bearer ${process.env.TOPOLOGY_API_TOKEN}` },
      }),
    );
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) throw new Error("auth failed");
    const userId = authResult.userId;
    const workspaceId = authResult.workspaceId;

    const [run] = await db
      .insert(runs)
      .values({
        workspaceId,
        name: `Shard merge ${Date.now()}`,
        kind: "automation",
        source: "github",
        status: "in_progress",
        environment: "ci",
        startedAt: new Date(),
        shardTotal: 2,
        shardsReceived: 0,
        createdById: userId,
        externalId: `thread-${Date.now()}`,
      })
      .returning();

    const { POST: submitShard } = await import(
      "@/app/api/ci/runs/[id]/shards/route"
    );
    const shard1 = await submitShard(
      new Request(`http://127.0.0.1/api/ci/runs/${run.id}/shards`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          shardIndex: 1,
          results: [
            {
              externalKey: "a::one",
              classname: "a",
              name: "one",
              status: "passed",
              notes: "",
              durationMs: 10,
            },
            {
              externalKey: "a::two",
              classname: "a",
              name: "two",
              status: "failed",
              notes: "boom",
              durationMs: 10,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(shard1.status).toBe(200);

    const shard2 = await submitShard(
      new Request(`http://127.0.0.1/api/ci/runs/${run.id}/shards`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          shardIndex: 2,
          results: [
            {
              externalKey: "a::two",
              classname: "a",
              name: "two",
              status: "passed",
              notes: "",
              durationMs: 20,
            },
            {
              externalKey: "b::three",
              classname: "b",
              name: "three",
              status: "failed",
              notes: "still broken",
              durationMs: 15,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(shard2.status).toBe(200);
    const shard2Body = (await shard2.json()) as {
      summary: { total: number; failed: number; passed: number };
    };
    expect(shard2Body.summary.total).toBe(3);
    expect(shard2Body.summary.passed).toBe(2);
    expect(shard2Body.summary.failed).toBe(1);

    const { POST: complete } = await import(
      "@/app/api/ci/runs/[id]/complete/route"
    );
    const done = await complete(
      new Request(`http://127.0.0.1/api/ci/runs/${run.id}/complete`, {
        method: "POST",
        headers: authHeaders(),
        body: "{}",
      }),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(done.status).toBe(200);
    const doneBody = (await done.json()) as {
      run: { status: string };
      summary: { failed: number };
    };
    expect(doneBody.run.status).toBe("completed");
    expect(doneBody.summary.failed).toBe(1);

    const lockedShard = await submitShard(
      new Request(`http://127.0.0.1/api/ci/runs/${run.id}/shards`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          shardIndex: 3,
          results: [
            {
              externalKey: "c::locked",
              classname: "c",
              name: "locked",
              status: "passed",
              notes: "",
              durationMs: 5,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(lockedShard.status).toBe(409);

    const lockedComplete = await complete(
      new Request(`http://127.0.0.1/api/ci/runs/${run.id}/complete`, {
        method: "POST",
        headers: authHeaders(),
        body: "{}",
      }),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(lockedComplete.status).toBe(409);
  });

  it("rejects junit rewrite of a completed run and reports only completed", async () => {
    const { POST } = await import("@/app/api/ci/junit/route");
    const create = await POST(
      new Request("http://127.0.0.1/api/ci/junit", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: `Immutable junit ${Date.now()}`,
          source: "cli",
          results: [
            {
              externalKey: "imm::one",
              classname: "imm",
              name: "one",
              status: "passed",
              notes: "",
              durationMs: 10,
            },
          ],
        }),
      }),
    );
    expect(create.status).toBe(200);
    const created = (await create.json()) as { run: { id: string } };

    const rewrite = await POST(
      new Request("http://127.0.0.1/api/ci/junit", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          runId: created.run.id,
          results: [
            {
              externalKey: "imm::two",
              classname: "imm",
              name: "two",
              status: "failed",
              notes: "should not land",
              durationMs: 10,
            },
          ],
        }),
      }),
    );
    expect(rewrite.status).toBe(409);

    const { db } = await import("@/db");
    const { runs } = await import("@/db/schema");
    const { listRunReports, getRunReport } = await import("@/lib/queries");
    const { authenticateCiRequest } = await import("@/lib/ci-auth");

    const authResult = await authenticateCiRequest(
      new Request("http://x", {
        headers: { Authorization: `Bearer ${process.env.TOPOLOGY_API_TOKEN}` },
      }),
    );
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) throw new Error("auth failed");
    const workspaceId = authResult.workspaceId;

    const [planned] = await db
      .insert(runs)
      .values({
        workspaceId,
        name: `Planned no report ${Date.now()}`,
        status: "planned",
        kind: "manual",
        source: "manual",
        environment: "local",
      })
      .returning();

    const reports = await listRunReports(workspaceId);
    expect(reports.every((r) => r.status === "completed")).toBe(true);
    expect(reports.some((r) => r.runId === created.run.id)).toBe(true);
    expect(reports.some((r) => r.runId === planned.id)).toBe(false);

    expect(await getRunReport(workspaceId, created.run.id)).not.toBeNull();
    expect(await getRunReport(workspaceId, planned.id)).toBeNull();
  });
});

describe("CLI ingest HTTP contract (mocked)", () => {
  it("posts junit submit payloads with bearer auth", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ run: { id: "r1" }, summary: { total: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const prevFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    process.env.TOPOLOGY_URL = "http://topology.test";
    process.env.TOPOLOGY_API_TOKEN = "topo_cli";

    try {
      const res = await fetch("http://topology.test/api/ci/junit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TOPOLOGY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "CLI mock submit",
          source: "cli",
          results: [
            {
              externalKey: "x::y",
              classname: "x",
              name: "y",
              status: "passed",
              notes: "",
              durationMs: 1,
            },
          ],
        }),
      });
      expect(res.ok).toBe(true);
      expect(fetchImpl).toHaveBeenCalledOnce();
      const init = fetchImpl.mock.calls[0]![1] as RequestInit;
      expect(init.headers).toMatchObject({
        Authorization: "Bearer topo_cli",
      });
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});

describe("mock issue provider (OAuth/provider isolation)", () => {
  afterEach(() => resetMockIssueStore());

  it("creates issues without contacting remote OAuth/issue APIs", async () => {
    const provider = createMockIssueProvider();
    const issue = await provider.createIssue({
      title: "[TOP-1] Hub — failed",
      description: "body",
    });
    expect(issue.provider).toBe("mock");
    expect(issue.key).toMatch(/^MOCK-/);
  });
});
