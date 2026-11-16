import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test, TOKENS } from "../fixtures";

const execute = promisify(execFile);
test("CLI subprocess ingests JUnit through real HTTP and persists exact totals", async ({ baseURL, page }) => {
  const name = `CLI HTTP ${randomUUID()}`;
  const { stdout } = await execute(process.execPath, ["--import", "tsx", "packages/cli/src/index.ts", "junit", "submit", "fixtures/junit/smoke.xml", "--source", "validation-http", "--name", name], {
    env: { ...process.env, TOPOLOGY_URL: baseURL!, TOPOLOGY_API_TOKEN: TOKENS.ciWrite }, timeout: 30_000,
  });
  const result = JSON.parse(stdout);
  expect(result.summary).toMatchObject({ total: 3, passed: 2, failed: 1 });
  const saved = await page.request.get(`/api/runs/${result.run.id}`);
  expect(saved.status()).toBe(200);
  const body = await saved.json();
  expect(body.run.name).toBe(name);
  expect(body.run.results.map((row: { status: string }) => row.status).sort()).toEqual(["failed", "passed", "passed"]);
});

test("MCP stdio subprocess calls the production HTTP server with agent scope", async ({ baseURL }) => {
  const env = Object.fromEntries(Object.entries({ ...process.env, TOPOLOGY_URL: baseURL!, TOPOLOGY_API_TOKEN: TOKENS.agent }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "packages/mcp/src/server.ts"], env });
  const client = new Client({ name: "validation-stdio", version: "1.0.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("list_cases");
    const response = await client.callTool({ name: "list_cases", arguments: { q: "HAR-1" } });
    expect(response.isError).not.toBe(true);
    const content = response.content as { type: string; text?: string }[];
    const text = content.find((item) => item.type === "text")?.text;
    expect(text).toBeTruthy();
    const data = JSON.parse(text!);
    expect(data.cases.length).toBeGreaterThan(0);
    expect(data.cases.every((row: { key: string }) => row.key.includes("HAR-1"))).toBe(true);
  } finally { await client.close(); await transport.close(); }
});
