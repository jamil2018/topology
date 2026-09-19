import { describe, expect, it, vi } from "vitest";
import { TopologyClient, requireEnv } from "./client";

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("TopologyClient", () => {
  it("sends bearer auth and resource query", async () => {
    const fetchImpl = vi.fn(async () => ok({ cases: [] }));

    const client = new TopologyClient({
      baseUrl: "http://127.0.0.1:4317",
      token: "topo_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listCases("smoke");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/api/agent?");
    expect(String(url)).toContain("resource=cases");
    expect(String(url)).toContain("q=smoke");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer topo_test",
    });
  });

  it("posts create_issue action", async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ issue: { remoteKey: "MOCK-1" } }),
    );
    const client = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = (await client.createIssue({
      resultId: "00000000-0000-0000-0000-000000000001",
      provider: "mock",
    })) as { issue: { remoteKey: string } };
    expect(out.issue.remoteKey).toBe("MOCK-1");
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body.action).toBe("create_issue");
  });

  it("lists runs, results, pending, and scenario context", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("resource=runs")) return ok({ runs: [] });
      if (url.includes("resource=results")) return ok({ results: [] });
      if (url.includes("resource=whats_pending")) return ok({ pending: [] });
      if (url.includes("resource=scenario_context"))
        return ok({ case: { key: "TOP-1" } });
      return ok({});
    });
    const client = new TopologyClient({
      baseUrl: "http://topology.test/",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listRuns();
    await client.listResults({ runId: "r1", status: "failed" });
    await client.whatsPending();
    await client.getScenarioContext("TOP-1");

    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("resource=runs"))).toBe(true);
    expect(urls.some((u) => u.includes("runId=r1"))).toBe(true);
    expect(urls.some((u) => u.includes("status=failed"))).toBe(true);
    expect(urls.some((u) => u.includes("whats_pending"))).toBe(true);
    expect(urls.some((u) => u.includes("q=TOP-1"))).toBe(true);
  });

  it("posts create_case, create_run, record_result, and link_issue", async () => {
    const fetchImpl = vi.fn(async () => ok({ ok: true }));
    const client = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createCase({ title: "Login" });
    await client.createRun({ name: "Smoke", caseKeys: ["TOP-1"] });
    await client.recordResult({
      runId: "r1",
      caseKey: "TOP-1",
      status: "failed",
    });
    await client.linkIssue({
      resultId: "res-1",
      remoteKey: "MOCK-2",
      provider: "mock",
    });

    const bodies = fetchImpl.mock.calls.map((c) =>
      JSON.parse(String(c[1]?.body)),
    );
    expect(bodies.map((b) => b.action)).toEqual([
      "create_case",
      "create_run",
      "record_result",
      "link_issue",
    ]);
  });

  it("lists intents, gets an intent, coverage, and creates test intents", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return ok({ intent: { key: "AUTH-1" } });
      }
      if (url.includes("resource=coverage")) return ok({ coverage: { gaps: [] } });
      if (url.includes("resource=intents") && url.includes("key="))
        return ok({ intent: { key: "TOP-1" } });
      if (url.includes("resource=intents")) return ok({ intents: [] });
      return ok({});
    });
    const client = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listIntents("auth");
    await client.getTestIntent({ key: "TOP-1" });
    await client.getCoverage();
    await client.createTestIntent({
      key: "AUTH-1",
      title: "Account lockout",
      criticality: "P0",
    });

    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("resource=intents") && u.includes("q=auth"))).toBe(
      true,
    );
    expect(urls.some((u) => u.includes("key=TOP-1"))).toBe(true);
    expect(urls.some((u) => u.includes("resource=coverage"))).toBe(true);
    const body = JSON.parse(String(fetchImpl.mock.calls.at(-1)![1]?.body));
    expect(body.action).toBe("create_test_intent");
    expect(body.key).toBe("AUTH-1");
  });

  it("posts proposeCoverage as pending proposal action", async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        proposal: { id: "p1", status: "pending" },
        message: "queued",
      }),
    );
    const client = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const payload = {
      diffs: [
        {
          entityType: "intent",
          action: "create",
          before: null,
          after: { key: "AUTH-200", title: "Negative path" },
        },
      ],
      rationale: "Coverage gap",
    };
    await client.proposeCoverage({
      payload,
      model: "external-agent",
      inputRefs: ["REQ-1"],
    });

    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      "http://topology.test/api/agent",
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body.action).toBe("propose_coverage");
    expect(body.payload).toEqual(payload);
    expect(body.model).toBe("external-agent");
  });

  it("posts getAffectedTests to /api/affected", async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        summary: { intents: 1 },
        impact: { intents: [{ key: "AUTH-021" }] },
        rulesSource: "request",
      }),
    );
    const client = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = (await client.getAffectedTests({
      paths: ["src/auth/lockout.ts"],
      rules: [{ pattern: "src/auth/", componentKey: "COMP-AUTH" }],
    })) as { summary: { intents: number } };

    expect(out.summary.intents).toBe(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      "http://topology.test/api/affected",
    );
    expect(fetchImpl.mock.calls[0]![1]?.method).toBe("POST");
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body).toEqual({
      paths: ["src/auth/lockout.ts"],
      rules: [{ pattern: "src/auth/", componentKey: "COMP-AUTH" }],
    });
  });

  it("posts getAffectedTests without rules so server can use DB path rules", async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        summary: { intents: 2 },
        rulesSource: "database",
      }),
    );
    const client = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.getAffectedTests({ paths: ["src/auth/lockout.ts"] });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body).toEqual({ paths: ["src/auth/lockout.ts"] });
    expect(body.rules).toBeUndefined();
  });

  it("posts qualitySearch DSL to /api/query", async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ entity: "intents", rows: [], count: 0 }),
    );
    const client = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.qualitySearch({
      dsl: "intents where criticality = P0",
    });
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      "http://topology.test/api/query",
    );
    expect(fetchImpl.mock.calls[0]![1]?.method).toBe("POST");
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body.dsl).toBe("intents where criticality = P0");
  });

  it("calls phase-6 agent resources and actions", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "link_automation") {
          return ok({ ok: true, intentId: "i1", implementationId: "impl1" });
        }
        if (body.action === "compare_releases") {
          return ok({ comparison: { flakeCount: { delta: -1 } } });
        }
      }
      if (url.includes("resource=requirement")) return ok({ requirement: { key: "REQ-1" } });
      if (url.includes("resource=execution_history")) return ok({ results: [] });
      if (url.includes("resource=failure_evidence")) return ok({ evidence: { notes: "x" } });
      if (url.includes("resource=coverage") && url.includes("filter=manual"))
        return ok({ coverage: { gaps: [] } });
      return ok({});
    });
    const client = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.getRequirement({ key: "REQ-1" });
    await client.getExecutionHistory({ intentKey: "AUTH-1", limit: 10 });
    await client.getFailureEvidence({
      resultId: "00000000-0000-0000-0000-000000000001",
    });
    await client.getCoverage("manual");
    await client.linkAutomation({ externalKey: "AUTO-1", intentKey: "AUTH-1" });
    await client.compareReleases({
      beforeReleaseId: "00000000-0000-0000-0000-000000000001",
      afterReleaseId: "00000000-0000-0000-0000-000000000002",
    });

    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(
      urls.some((u) => u.includes("resource=requirement") && u.includes("key=REQ-1")),
    ).toBe(true);
    expect(
      urls.some(
        (u) => u.includes("execution_history") && u.includes("intentKey=AUTH-1"),
      ),
    ).toBe(true);
    expect(urls.some((u) => u.includes("failure_evidence"))).toBe(true);
    expect(urls.some((u) => u.includes("filter=manual"))).toBe(true);
    const postBodies = fetchImpl.mock.calls
      .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
      .map((c) => JSON.parse(String(c[1]?.body)));
    expect(postBodies.map((b) => b.action)).toEqual([
      "link_automation",
      "compare_releases",
    ]);
  });

  it("requireEnv validates TOPOLOGY_URL and TOPOLOGY_API_TOKEN", () => {
    const prevUrl = process.env.TOPOLOGY_URL;
    const prevToken = process.env.TOPOLOGY_API_TOKEN;
    delete process.env.TOPOLOGY_URL;
    delete process.env.TOPOLOGY_API_TOKEN;
    expect(() => requireEnv()).toThrow(/TOPOLOGY_URL/);
    process.env.TOPOLOGY_URL = "http://127.0.0.1:4317";
    expect(() => requireEnv()).toThrow(/TOPOLOGY_API_TOKEN/);
    process.env.TOPOLOGY_API_TOKEN = "topo_x";
    expect(requireEnv()).toEqual({
      baseUrl: "http://127.0.0.1:4317",
      token: "topo_x",
    });
    process.env.TOPOLOGY_URL = prevUrl;
    process.env.TOPOLOGY_API_TOKEN = prevToken;
  });
});
