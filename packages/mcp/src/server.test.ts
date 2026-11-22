import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { TopologyClient } from "./client";
import { createTopologyMcpServer } from "./server";

const AGENT_TOOLS = [
  "list_cases",
  "get_case",
  "get_plan",
  "list_catalog",
  "create_case",
  "list_runs",
  "create_run",
  "create_assigned_run",
  "launch_assigned_plan",
  "get_result",
  "get_workflow_request",
  "get_pr_release_evidence",
  "request_pr_workflow",
  "record_observation",
  "create_retest",
  "handoff_run",
  "list_results",
  "record_result",
  "whats_pending",
  "get_scenario_context",
  "list_intents",
  "get_test_intent",
  "create_test_intent",
  "get_coverage",
  "get_requirement",
  "get_execution_history",
  "get_failure_evidence",
  "link_automation",
  "compare_releases",
  "propose_coverage",
  "get_affected_tests",
  "quality_search",
  "search_tests",
  "create_issue",
  "link_issue",
];

describe("createTopologyMcpServer", () => {
  it("registers the agent tools and no others", async () => {
    const topology = new TopologyClient({
      baseUrl: "http://topology.test",
      token: "unused-for-list",
      fetchImpl: async () => {
        throw new Error("listTools must not call Topology");
      },
    });
    const server = createTopologyMcpServer(topology);
    const mcp = new Client({ name: "topology-tool-list", version: "0.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverSide);
      await mcp.connect(clientSide);
      const listed = await mcp.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        [...AGENT_TOOLS].sort(),
      );
    } finally {
      await mcp.close().catch(() => {});
      await server.close().catch(() => {});
    }
  });
});
