import { describe, expect, it, vi } from "vitest";
import { TopologyClient } from "./client";

describe("TopologyClient", () => {
  it("sends bearer auth and resource query", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ cases: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

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
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ issue: { remoteKey: "MOCK-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
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
});
