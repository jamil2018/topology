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
