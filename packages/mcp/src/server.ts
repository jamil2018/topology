import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TopologyClient, requireEnv } from "./client.js";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function createTopologyMcpServer(client: TopologyClient) {
  const server = new McpServer({
    name: "topology",
    version: "0.1.0",
  });

  server.tool(
    "list_cases",
    "List or search Topology test cases",
    { q: z.string().optional() },
    async ({ q }) => jsonText(await client.listCases(q)),
  );

  server.tool(
    "create_case",
    "Create a test case",
    {
      title: z.string(),
      key: z.string().optional(),
      description: z.string().optional(),
      steps: z.string().optional(),
      expectedResult: z.string().optional(),
      priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
      tags: z.array(z.string()).optional(),
    },
    async (args) => jsonText(await client.createCase(args)),
  );

  server.tool(
    "list_runs",
    "List recent test runs",
    async () => jsonText(await client.listRuns()),
  );

  server.tool(
    "create_run",
    "Create a run from case IDs or keys",
    {
      name: z.string(),
      description: z.string().optional(),
      caseIds: z.array(z.string()).optional(),
      caseKeys: z.array(z.string()).optional(),
    },
    async (args) => jsonText(await client.createRun(args)),
  );

  server.tool(
    "list_results",
    "List results, optionally filtered by run or status",
    {
      runId: z.string().optional(),
      status: z.string().optional(),
    },
    async (args) => jsonText(await client.listResults(args)),
  );

  server.tool(
    "record_result",
    "Record pass/fail/block/skip for a case in a run",
    {
      runId: z.string(),
      caseId: z.string().optional(),
      caseKey: z.string().optional(),
      status: z.enum(["untested", "passed", "failed", "blocked", "skipped"]),
      notes: z.string().optional(),
    },
    async (args) => jsonText(await client.recordResult(args)),
  );

  server.tool(
    "whats_pending",
    "Hub pending work: untested results, failures without issues, retest queue",
    async () => jsonText(await client.whatsPending()),
  );

  server.tool(
    "get_scenario_context",
    "Aggregate cases, recent results, open issues, and latest runs for a query",
    { q: z.string() },
    async ({ q }) => jsonText(await client.getScenarioContext(q)),
  );

  server.tool(
    "list_intents",
    "List or search Topology test intents",
    { q: z.string().optional() },
    async ({ q }) => jsonText(await client.listIntents(q)),
  );

  server.tool(
    "get_test_intent",
    "Get a test intent by id or key, including implementations and edges",
    {
      id: z.string().optional(),
      key: z.string().optional(),
    },
    async (args) => jsonText(await client.getTestIntent(args)),
  );

  server.tool(
    "create_test_intent",
    "Create a test intent in the quality graph",
    {
      key: z.string(),
      title: z.string(),
      behavior: z.string().optional(),
      criticality: z.enum(["P0", "P1", "P2", "P3"]).optional(),
      status: z.enum(["draft", "ready", "blocked", "deprecated"]).optional(),
    },
    async (args) => jsonText(await client.createTestIntent(args)),
  );

  server.tool(
    "get_coverage",
    "Get requirement/risk/automation/execution coverage and gaps for the workspace",
    async () => jsonText(await client.getCoverage()),
  );

  server.tool(
    "propose_coverage",
    "Queue a coverage proposal (create intent / link edge) for human review. Does NOT write to the graph until accepted.",
    {
      payload: z.object({
        diffs: z.array(z.record(z.string(), z.unknown())).min(1),
        rationale: z.string().optional(),
      }),
      entityType: z.string().optional(),
      model: z.string().optional(),
      inputRefs: z.array(z.string()).optional(),
    },
    async (args) => jsonText(await client.proposeCoverage(args)),
  );

  server.tool(
    "get_affected_tests",
    "Walk changed paths through path→component rules to list affected requirements, intents, implementations, and gaps",
    {
      paths: z.array(z.string()).min(1),
      rules: z
        .array(
          z.object({
            pattern: z.string(),
            componentKey: z.string(),
          }),
        )
        .optional(),
    },
    async (args) => jsonText(await client.getAffectedTests(args)),
  );

  const qualitySearchSchema = {
    dsl: z
      .string()
      .optional()
      .describe(
        'Quality QL DSL, e.g. intents where component = payments and criticality = P0',
      ),
    query: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("QualityQuery AST: { entity, filters, sort }"),
    limit: z.number().int().positive().max(1000).optional(),
  };

  async function runQualitySearch(args: {
    dsl?: string;
    query?: Record<string, unknown>;
    limit?: number;
  }) {
    if (!args.dsl && !args.query) {
      throw new Error("Provide dsl or query");
    }
    return jsonText(await client.qualitySearch(args));
  }

  server.tool(
    "quality_search",
    "Search the quality graph with structured QL (DSL or AST). Entities: intents, requirements, implementations, executions.",
    qualitySearchSchema,
    runQualitySearch,
  );

  server.tool(
    "search_tests",
    "Alias for quality_search — query intents/requirements/implementations/executions",
    qualitySearchSchema,
    runQualitySearch,
  );

  server.tool(
    "create_issue",
    "Create a tracker issue from a failed/blocked result",
    {
      resultId: z.string(),
      provider: z.enum(["mock", "jira", "linear", "github"]).optional(),
      title: z.string().optional(),
      description: z.string().optional(),
    },
    async (args) => jsonText(await client.createIssue(args)),
  );

  server.tool(
    "link_issue",
    "Link an existing tracker issue to a result",
    {
      resultId: z.string(),
      remoteKey: z.string(),
      provider: z.enum(["mock", "jira", "linear", "github"]).optional(),
    },
    async (args) => jsonText(await client.linkIssue(args)),
  );

  return server;
}

export async function startTopologyMcpServer() {
  const env = requireEnv();
  const client = new TopologyClient(env);
  const server = createTopologyMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { TopologyClient, requireEnv } from "./client.js";

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") ||
    process.argv[1].endsWith("topology-mcp.js"));

if (isDirect) {
  startTopologyMcpServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
