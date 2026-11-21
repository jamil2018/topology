import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/render";
import {
  ConnectAgentPanel,
  agentEndpoint,
  formatRelativeWhen,
  latestAgentTokenUse,
  snippetFor,
} from "./connect-agent-panel";

describe("connect-agent-panel helpers", () => {
  it("builds Cursor and Claude JSON snippets and stdio exports", () => {
    const cursor = snippetFor("cursor", "http://localhost:4317", "topo_x");
    expect(JSON.parse(cursor)).toMatchObject({
      mcpServers: {
        topology: {
          command: "npx",
          args: ["-y", "@topology/mcp"],
          env: {
            TOPOLOGY_URL: "http://localhost:4317",
            TOPOLOGY_API_TOKEN: "topo_x",
          },
        },
      },
    });

    const claude = snippetFor("claude", "http://localhost:4317", "topo_x");
    expect(claude).toContain('"mcpServers"');
    expect(claude).toContain("topo_x");

    const stdio = snippetFor("stdio", "http://localhost:4317", "topo_x");
    expect(stdio).toContain("export TOPOLOGY_URL=http://localhost:4317");
    expect(stdio).toContain("export TOPOLOGY_API_TOKEN=topo_x");
    expect(stdio).toContain("npx -y @topology/mcp");
  });

  it("builds the agent probe endpoint and finds latest agent token use", () => {
    expect(agentEndpoint("http://localhost:4317/")).toBe(
      "http://localhost:4317/api/agent?resource=whats_pending",
    );

    const latest = latestAgentTokenUse([
      {
        id: "1",
        name: "ci",
        tokenPrefix: "topo_ci",
        scope: "ci-write",
        lastUsedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        name: "agent-old",
        tokenPrefix: "topo_a1",
        scope: "agent",
        lastUsedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "3",
        name: "agent-new",
        tokenPrefix: "topo_a2",
        scope: "read,agent",
        lastUsedAt: "2026-03-01T12:00:00.000Z",
      },
    ]);
    expect(latest?.toISOString()).toBe("2026-03-01T12:00:00.000Z");
    expect(latestAgentTokenUse([])).toBeNull();
  });

  it("formats relative timestamps", () => {
    expect(formatRelativeWhen(null)).toBe("never");
    expect(formatRelativeWhen(new Date())).toBe("just now");
  });
});

describe("ConnectAgentPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/tokens" && (!init || !init.method || init.method === "GET")) {
          return new Response(
            JSON.stringify({
              tokens: [
                {
                  id: "t1",
                  name: "MCP agent",
                  tokenPrefix: "topo_ag",
                  scope: "agent",
                  lastUsedAt: "2026-11-20T10:00:00.000Z",
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url === "/api/tokens" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              plaintext: "topo_generated_agent_token",
              token: {
                id: "t2",
                name: "MCP agent",
                tokenPrefix: "topo_ge",
                scope: "agent",
                lastUsedAt: null,
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/agent?resource=whats_pending")) {
          return new Response(JSON.stringify({ untested: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), {
          status: 500,
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("switches client tabs and generates a scoped token into the snippet", async () => {
    render(<ConnectAgentPanel defaultUrl="http://127.0.0.1:4317" compact />);

    expect(screen.getByRole("tab", { name: "Cursor" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Generic stdio" }));
    expect(screen.getByRole("tab", { name: "Generic stdio" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/Generic stdio snippet/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Generate agent token" }));
    await waitFor(() => {
      expect(
        (screen.getByLabelText("API token") as HTMLInputElement).value,
      ).toBe("topo_generated_agent_token");
    });
    expect(screen.getByText(/Agent-scoped token created/i)).toBeTruthy();
  });

  it("tests the agent connection and shows status", async () => {
    render(<ConnectAgentPanel defaultUrl="http://127.0.0.1:4317" compact />);

    const tokenInput = screen.getByLabelText("API token") as HTMLInputElement;
    fireEvent.change(tokenInput, { target: { value: "topo_test" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Connected — agent API responded to whats_pending/i),
      ).toBeTruthy();
    });
    expect(
      screen.getByText((_content, node) => {
        const text = node?.textContent ?? "";
        return Boolean(
          node?.tagName === "P" &&
            text.includes("Last agent call:") &&
            text.includes("Test:") &&
            text.includes("ok"),
        );
      }),
    ).toBeTruthy();
  });
});
