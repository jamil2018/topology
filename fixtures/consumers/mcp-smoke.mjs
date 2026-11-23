import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "consumer-fixture", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: "./node_modules/.bin/topology-mcp",
  env: { ...process.env },
  stderr: "inherit",
});
try {
  await client.connect(transport);
  assert.ok((await client.listTools()).tools.some((tool) => tool.name === "list_cases"));
  const response = await client.callTool({ name: "list_cases", arguments: { limit: 1 } });
  if (process.argv[2] === "revoked") {
    assert.equal(response.isError, true);
    assert.match(JSON.stringify(response.content), /401|auth|token/i);
  } else {
    assert.notEqual(response.isError, true);
    const data = JSON.parse(response.content[0].text);
    assert.equal(data.cases.length, 1);
  }
} finally {
  await client.close();
}
