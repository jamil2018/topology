import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TopologyClient, requireEnv } from "./client.js";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(data && typeof data === "object" && !Array.isArray(data)
      ? { structuredContent: data as Record<string, unknown> }
      : {}),
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
    {
      q: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      status: z.enum(["draft", "in_review", "ready", "blocked", "deprecated"]).optional(),
    },
    async ({ q, ...page }) => jsonText(await client.listCases(q, page)),
  );

  server.tool(
    "get_case",
    "Read a case and its structured steps, datasets, custom fields and version history",
    { id: z.uuid().optional(), key: z.string().optional() },
    async (args) => jsonText(await client.getCase(args)),
  );
  server.tool(
    "list_catalog",
    "List folders, shared steps, custom field definitions, plans, or run templates",
    {
      resource: z.enum(["folders", "shared_steps", "custom_fields", "plans", "run_templates"]),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => jsonText(await client.listCatalog(args)),
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
    "List test runs with optional status and cursor",
    {
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      status: z.enum(["planned", "in_progress", "completed", "aborted"]).optional(),
    },
    async (args) => jsonText(await client.listRuns(args)),
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
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => jsonText(await client.listResults(args)),
  );

  server.tool(
    "get_result",
    "Read an exact result, iteration and step snapshots",
    { id: z.uuid() },
    async ({ id }) => jsonText(await client.getResult(id)),
  );

  const operationKey = z.string().min(1).max(128).describe("Reuse this key when retrying the same operation");
  server.tool(
    "create_assigned_run",
    "Create a manual run of approved cases and assign it to the credential owner",
    {
      idempotencyKey: operationKey,
      name: z.string(),
      caseIds: z.array(z.uuid()).min(1).max(500),
      description: z.string().optional(),
      environment: z.string().optional(),
    },
    async ({ idempotencyKey, ...args }) => jsonText(await client.runOperation(idempotencyKey, {
      action: "create_run",
      ...args,
    })),
  );
  server.tool(
    "request_pr_workflow",
    "Ask an approved GitHub Actions workflow to test the current head of a pull request",
    {
      idempotencyKey: operationKey,
      pullRequestId: z.uuid(),
      commitSha: z.string().regex(/^[0-9a-f]{40}$/),
      workflow: z.string(),
      environment: z.string(),
      caseIds: z.array(z.uuid()).min(1).max(50),
    },
    async ({ idempotencyKey, ...args }) => jsonText(await client.runOperation(idempotencyKey, {
      action: "request_workflow",
      ...args,
    })),
  );
  server.tool(
    "get_pr_release_evidence",
    "Read the release policy matrix and human sign-off for a pull request",
    { pullRequestId: z.uuid() },
    async ({ pullRequestId }) => jsonText(await client.getReleaseEvidence(pullRequestId)),
  );
  server.tool(
    "get_workflow_request",
    "Read provider status, commit freshness, and the resulting report for a workflow request",
    { id: z.uuid() },
    async ({ id }) => jsonText(await client.getWorkflowRequest(id)),
  );

  server.tool(
    "record_observation",
    "Record an observation on one assigned result or step using its exact ID",
    {
      idempotencyKey: operationKey,
      runId: z.uuid(),
      resultId: z.uuid(),
      stepResultId: z.uuid().optional(),
      status: z.enum(["untested", "passed", "failed", "blocked", "skipped"]),
      notes: z.string().optional(),
      sourceRefs: z.array(z.string()).optional(),
    },
    async ({ idempotencyKey, ...args }) => jsonText(await client.runOperation(idempotencyKey, {
      action: "record_result",
      ...args,
    })),
  );

  server.tool(
    "create_retest",
    "Create an assigned retest with lineage from explicitly selected failed or blocked results",
    {
      idempotencyKey: operationKey,
      name: z.string(),
      sourceResultIds: z.array(z.uuid()).min(1).max(500),
      description: z.string().optional(),
      environment: z.string().optional(),
    },
    async ({ idempotencyKey, ...args }) => jsonText(await client.runOperation(idempotencyKey, {
      action: "create_retest",
      ...args,
    })),
  );
  server.tool(
    "handoff_run",
    "Hand an assigned manual run to another project member with a note",
    { idempotencyKey: operationKey, runId: z.uuid(), assigneeId: z.uuid(), notes: z.string() },
    async ({ idempotencyKey, ...args }) => jsonText(await client.runOperation(idempotencyKey, {
      action: "handoff_run",
      ...args,
    })),
  );

  server.tool(
    "record_result",
    "Record pass/fail/block/skip for a case in a run",
    {
      runId: z.string(),
      resultId: z.uuid().optional(),
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
    { filter: z.string().optional().describe("Narrow gaps by kind, key, or title") },
    async ({ filter }) => jsonText(await client.getCoverage(filter)),
  );

  server.tool(
    "get_requirement",
    "Get a requirement by id or key (getRequirement), including quality graph edges",
    {
      id: z.string().optional(),
      key: z.string().optional(),
    },
    async (args) => jsonText(await client.getRequirement(args)),
  );

  server.tool(
    "get_execution_history",
    "Recent run results for an intent or implementation (getExecutionHistory)",
    {
      intentId: z.string().optional(),
      intentKey: z.string().optional(),
      implementationId: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async (args) => jsonText(await client.getExecutionHistory(args)),
  );

  server.tool(
    "get_failure_evidence",
    "Failure notes, error, stack, attachments, and signature for a result or signature id (getFailureEvidence)",
    {
      resultId: z.string().optional(),
      signatureId: z.string().optional(),
    },
    async (args) => jsonText(await client.getFailureEvidence(args)),
  );

  server.tool(
    "link_automation",
    "Link an automation implementation to a test intent (linkAutomation)",
    {
      implementationId: z.string().optional(),
      externalKey: z.string().optional(),
      intentId: z.string().optional(),
      intentKey: z.string().optional(),
    },
    async (args) => jsonText(await client.linkAutomation(args)),
  );

  server.tool(
    "compare_releases",
    "Compare release snapshots or stored release ids (compareReleases)",
    {
      beforeReleaseId: z.string().optional(),
      afterReleaseId: z.string().optional(),
      before: z.record(z.string(), z.unknown()).optional(),
      after: z.record(z.string(), z.unknown()).optional(),
    },
    async (args) => jsonText(await client.compareReleases(args)),
  );

  server.tool(
    "propose_coverage",
    "Queue a coverage proposal (create intent / link edge) for human review. Does NOT write to the graph until accepted.",
    {
      idempotencyKey: operationKey.optional(),
      payload: z.object({
        diffs: z.array(z.record(z.string(), z.unknown())).min(1),
        rationale: z.string().optional(),
      }),
      entityType: z.string().optional(),
      model: z.string().optional(),
      inputRefs: z.array(z.string()).optional(),
    },
    async ({ idempotencyKey, ...args }) => jsonText(idempotencyKey
      ? await client.runOperation(idempotencyKey, { action: "propose_coverage", ...args })
      : await client.proposeCoverage(args)),
  );

  server.tool(
    "get_affected_tests",
    "Walk changed paths through path→component rules to list affected requirements, intents, implementations, and gaps",
    {
      paths: z.array(z.string()).min(1).optional(),
      commitSha: z.string().optional(),
      pr: z.number().int().positive().optional(),
      repositoryId: z.uuid().optional(),
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
      provider: z.enum(["mock", "jira", "linear", "github", "gitlab"]).optional(),
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
      provider: z.enum(["mock", "jira", "linear", "github", "gitlab"]).optional(),
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

const isDirect = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirect) {
  startTopologyMcpServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
