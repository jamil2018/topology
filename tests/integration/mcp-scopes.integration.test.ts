import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTopologyMcpServer, TopologyClient } from "@topology/mcp";

const hasDb = Boolean(process.env.DATABASE_URL);

type ToolResult = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
};

/**
 * MCP tools do not check scopes themselves. They call TopologyClient, which
 * hits the agent route. That route requires the `agent` scope.
 */
async function agentRouteFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(String(input));
  const request = new Request(url, init);
  if (url.pathname !== "/api/agent") {
    return new Response(JSON.stringify({ error: "unmapped in mcp scope test" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const mod = await import("@/app/api/agent/route");
  if ((init?.method ?? "GET").toUpperCase() === "POST") return mod.POST(request);
  return mod.GET(request);
}

async function withMcp(token: string, run: (client: Client) => Promise<void>) {
  const topology = new TopologyClient({
    baseUrl: "http://topology.test",
    token,
    fetchImpl: agentRouteFetch,
  });
  const server = createTopologyMcpServer(topology);
  const mcp = new Client({ name: "topology-scope-test", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverSide);
    await mcp.connect(clientSide);
    await run(mcp);
  } finally {
    await mcp.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

function toolText(result: ToolResult): string {
  return result.content?.map((part) => part.text ?? "").join("\n") ?? "";
}

describe.skipIf(!hasDb)("MCP agent scope (integration)", () => {
  const createdTokenIds: string[] = [];
  let readToken = "";
  let ciWriteToken = "";
  let agentToken = "";

  beforeAll(async () => {
    process.env.TOPOLOGY_API_TOKEN ??= "topo_demo_token_local_dev_only";
    process.env.DEMO_USER_EMAIL ??= "demo@topology.local";
    process.env.TOPOLOGY_ISSUE_PROVIDER = "mock";

    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { apiTokens, users } = await import("@/db/schema");
    const { generateApiToken } = await import("@/lib/ci-auth");
    const { ensureMembership } = await import("@/lib/workspace");

    const demo = await db.query.users.findFirst({
      where: eq(users.email, process.env.DEMO_USER_EMAIL!),
    });
    expect(demo?.id).toBeTruthy();
    const { workspace } = await ensureMembership(demo!.id, "admin");

    async function mint(scope: string) {
      const minted = generateApiToken();
      const [row] = await db
        .insert(apiTokens)
        .values({
          workspaceId: workspace.id,
          name: `mcp-scope-${scope}-${Date.now()}`,
          tokenHash: minted.hash,
          tokenPrefix: minted.prefix,
          scope,
          userId: demo!.id,
        })
        .returning();
      createdTokenIds.push(row.id);
      return minted.token;
    }

    readToken = await mint("read");
    ciWriteToken = await mint("ci-write");
    agentToken = await mint("agent");
  });

  afterAll(async () => {
    if (createdTokenIds.length === 0) return;
    const { inArray } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { apiTokens } = await import("@/db/schema");
    await db.delete(apiTokens).where(inArray(apiTokens.id, createdTokenIds));
  });

  it("rejects a read-only token for agent writes and reads", async () => {
    await withMcp(readToken, async (mcp) => {
      const write = (await mcp.callTool({
        name: "create_case",
        arguments: { title: `read token must not create ${Date.now()}` },
      })) as ToolResult;
      expect(write.isError).toBe(true);
      expect(toolText(write)).toMatch(/Token scope insufficient/);

      const read = (await mcp.callTool({
        name: "list_cases",
        arguments: {},
      })) as ToolResult;
      expect(read.isError).toBe(true);
      expect(toolText(read)).toMatch(/Token scope insufficient/);
    });
  });

  it("rejects a ci-write token for agent tools", async () => {
    await withMcp(ciWriteToken, async (mcp) => {
      const write = (await mcp.callTool({
        name: "create_case",
        arguments: { title: `ci-write must not create ${Date.now()}` },
      })) as ToolResult;
      expect(write.isError).toBe(true);
      expect(toolText(write)).toMatch(/Token scope insufficient/);
    });
  });

  it("accepts an agent-scoped token for list_cases and create_case", async () => {
    const title = `Agent scope case ${Date.now()}`;
    const key = `MCP-SCOPE-${Date.now()}`;
    await withMcp(agentToken, async (mcp) => {
      const listed = (await mcp.callTool({
        name: "list_cases",
        arguments: {},
      })) as ToolResult;
      expect(listed.isError).toBeFalsy();
      const listedBody = JSON.parse(toolText(listed)) as { cases?: unknown[] };
      expect(Array.isArray(listedBody.cases)).toBe(true);

      const created = (await mcp.callTool({
        name: "create_case",
        arguments: { title, key },
      })) as ToolResult;
      expect(created.isError).toBeFalsy();
      const createdBody = JSON.parse(toolText(created)) as {
        case?: { title?: string };
      };
      expect(createdBody.case?.title).toBe(title);
    });
  });
});
