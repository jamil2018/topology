import { allCasesReady, caseReviewRequired, lockCaseReviewPolicy } from "@/lib/case-review-policy";
import { NextResponse } from "next/server";
import { and, asc, count, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { authenticateApiToken } from "@/lib/api-auth";
import { dbErrorResponse, isUniqueViolation, readJsonBody } from "@/lib/http-errors";
import { db } from "@/db";
import { decodeListCursor, encodeListCursor, parseLimitParam } from "@/lib/list-pagination";
import { listCasesPage } from "@/lib/queries/list-cases";
import { isUuid } from "@/lib/queries/ids";
import { readCaseRevision } from "@/lib/case-revision";
import { loadCaseTcm } from "@/lib/tcm/case-tcm";
import { seedManualRunResults } from "@/lib/tcm/seed-run";
import { parseMatrixJson } from "@/lib/tcm/matrix";
import { listRegressionBaselines, readRegressionBaseline } from "@/lib/tcm/baselines";
import { readExploratorySession } from "@/lib/tcm/exploratory-session";
import { planRevision } from "@/lib/tcm/plans";
import { runTemplateRevision, validateTemplateReferences } from "@/lib/run-template-access";
import {
  caseStatusEnum, caseVersions, cases, customFieldDefs, environments, folders, resultStatusEnum, runResults,
  runs, runStatusEnum, runTemplates, sharedSteps, testImplementations, testIntents, testPlanCases, testPlans, workspaces,
} from "@/db/schema";
import {
  createIssueFromResult,
  getScenarioContext,
  linkExistingIssue,
  syncIssuesOnPassingRetest,
  whatsPending,
} from "@/lib/issues";
import { AgentOperationError, runAgentOperation } from "@/lib/agent-operations";
import { readRunnerRequest } from "@/lib/ci-runner";
import { openTriageForResult } from "@/lib/ci-ingest";
import {
  immutableMessageFor,
  isRunFrozen,
} from "@/lib/run-immutability-http";

const catalogResources = {
  folders,
  shared_steps: sharedSteps,
  custom_fields: customFieldDefs,
  plans: testPlans,
  run_templates: runTemplates,
} as const;

function cursorId(params: URLSearchParams) {
  const cursor = params.get("cursor");
  if (cursor === null) return undefined;
  const id = decodeListCursor(cursor)?.id;
  return id && isUuid(id) ? id : null;
}

function pageById<Row extends { id: string }>(rows: Row[], limit: number) {
  const selected = rows.slice(0, limit);
  const last = selected.at(-1);
  return {
    selected,
    nextCursor: rows.length > limit && last ? encodeListCursor({ id: last.id, sortValue: "" }) : null,
  };
}

export async function GET(request: Request) {
  const authResult = await authenticateApiToken(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error, code: "AUTHORIZATION_FAILED" },
      { status: authResult.status },
    );
  }
  if (!authResult.scopes.includes("agent") && !authResult.scopes.includes("agent-read")) {
    return NextResponse.json({ error: "Token scope insufficient", code: "CAPABILITY_REQUIRED" }, { status: 403 });
  }
  const workspaceId = authResult.workspaceId;

  const { searchParams } = new URL(request.url);
  const resource = searchParams.get("resource") ?? "cases";
  const assignee = searchParams.get("assignee");
  const assigneeId = assignee === "me" ? authResult.userId : null;
  if ((resource === "runs" || resource === "results") && assignee !== null && !assigneeId) {
    return NextResponse.json({ error: "Use assignee=me with a credential tied to a user", code: "INVALID_FILTER" }, { status: 400 });
  }

  if (resource === "cases") {
    const status = z.enum(caseStatusEnum.enumValues).optional().safeParse(searchParams.get("status") ?? undefined);
    const cursor = searchParams.get("cursor");
    if (!status.success || (cursor !== null && !isUuid(decodeListCursor(cursor)?.id ?? ""))) {
      return NextResponse.json({ error: "Invalid status or cursor" }, { status: 400 });
    }
    const page = await listCasesPage(workspaceId, {
      search: searchParams.get("q") ?? undefined,
      statusFilter: status.data,
      sort: "key",
      dir: "asc",
      limit: parseLimitParam(searchParams.get("limit"), 100),
      cursor,
    });
    return NextResponse.json({
      cases: page.items,
      total: page.total,
      nextCursor: page.nextCursor,
    });
  }

  if (resource === "case") {
    const id = searchParams.get("id");
    const key = searchParams.get("key");
    if ((!id && !key) || (id && !isUuid(id)) || (id && key)) {
      return NextResponse.json({ error: "Provide one valid case id or key", code: "INVALID_ID" }, { status: 400 });
    }
    const row = await db.query.cases.findFirst({ where: and(
      eq(cases.workspaceId, workspaceId),
      id ? eq(cases.id, id) : eq(cases.key, key!),
    ) });
    if (!row) return NextResponse.json({ error: "Case not found", code: "CASE_NOT_FOUND" }, { status: 404 });
    const [tcm, versions, revision] = await Promise.all([
      loadCaseTcm(workspaceId, row.id),
      db.query.caseVersions.findMany({
        where: and(eq(caseVersions.workspaceId, workspaceId), eq(caseVersions.caseId, row.id)),
        orderBy: [desc(caseVersions.version)],
        limit: 20,
        columns: { id: true, version: true, createdAt: true },
      }),
      readCaseRevision(workspaceId, row.id),
    ]);
    return NextResponse.json({ case: { ...row, ...tcm }, versions, revision: revision?.revision ?? null, href: `/cases/${encodeURIComponent(row.key)}` });
  }

  if (resource === "baselines") {
    const cursor = cursorId(searchParams);
    if (cursor === null) return NextResponse.json({ error: "Invalid cursor", code: "INVALID_CURSOR" }, { status: 400 });
    const limit = parseLimitParam(searchParams.get("limit"), 50);
    const rows = await listRegressionBaselines({ workspaceId, before: cursor, limit: limit + 1 });
    const { selected, nextCursor } = pageById(rows, limit);
    return NextResponse.json({ items: selected, nextCursor });
  }

  if (resource === "baseline") {
    const id = searchParams.get("id") ?? "";
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid baseline id", code: "INVALID_ID" }, { status: 400 });
    const baseline = await readRegressionBaseline(workspaceId, id);
    if (!baseline) return NextResponse.json({ error: "Baseline not found", code: "BASELINE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({
      baseline, href: baseline.planId ? `/plans/${baseline.planId}#baseline-${id}` : null,
    });
  }

  if (resource === "plan") {
    const id = searchParams.get("id") ?? "";
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid plan id", code: "INVALID_ID" }, { status: 400 });
    const plan = await db.query.testPlans.findFirst({ where: and(eq(testPlans.id, id), eq(testPlans.workspaceId, workspaceId)) });
    if (!plan) return NextResponse.json({ error: "Plan not found", code: "PLAN_NOT_FOUND" }, { status: 404 });
    const linked = await db.select({ id: cases.id, key: cases.key, title: cases.title, status: cases.status, linkId: testPlanCases.caseId })
      .from(testPlanCases).leftJoin(cases, and(eq(testPlanCases.caseId, cases.id), eq(cases.workspaceId, workspaceId)))
      .where(eq(testPlanCases.planId, id)).orderBy(asc(testPlanCases.position), asc(testPlanCases.caseId));
    const { matrixJson, ...details } = plan;
    return NextResponse.json({
      plan: {
        ...details, matrix: parseMatrixJson(matrixJson),
        cases: linked.filter((row) => row.id !== null).map(({ id, key, title, status }) => ({ id, key, title, status })),
      },
      revision: planRevision(plan, linked.map(({ linkId }) => linkId)),
      unavailableCases: linked.filter((row) => row.id === null).length,
      href: `/plans/${id}`,
    });
  }

  if (resource === "environments") {
    const cursor = cursorId(searchParams);
    if (cursor === null) return NextResponse.json({ error: "Invalid cursor", code: "INVALID_CURSOR" }, { status: 400 });
    const limit = parseLimitParam(searchParams.get("limit"), 50);
    const rows = await db.select({ id: environments.id, name: environments.name, kind: environments.kind })
      .from(environments).where(and(eq(environments.workspaceId, workspaceId), cursor ? lt(environments.id, cursor) : undefined))
      .orderBy(desc(environments.id)).limit(limit + 1);
    const { selected, nextCursor } = pageById(rows, limit);
    return NextResponse.json({ items: selected, nextCursor });
  }

  if (resource === "run_template") {
    const id = searchParams.get("id") ?? "";
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid run template id", code: "INVALID_ID" }, { status: 400 });
    const template = await db.query.runTemplates.findFirst({
      where: and(eq(runTemplates.id, id), eq(runTemplates.workspaceId, workspaceId)),
    });
    if (!template) return NextResponse.json({ error: "Run template not found", code: "TEMPLATE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({
      template, revision: runTemplateRevision(template),
      warning: await validateTemplateReferences(workspaceId, template), href: `/runs/new?template=${id}`,
    });
  }

  if (Object.hasOwn(catalogResources, resource)) {
    const cursor = cursorId(searchParams);
    if (cursor === null) return NextResponse.json({ error: "Invalid cursor", code: "INVALID_CURSOR" }, { status: 400 });
    const limit = parseLimitParam(searchParams.get("limit"), 50);
    const table = catalogResources[resource as keyof typeof catalogResources];
    const rows = await db.select().from(table).where(and(
      eq(table.workspaceId, workspaceId),
      cursor ? lt(table.id, cursor) : undefined,
    )).orderBy(desc(table.id)).limit(limit + 1);
    const { selected, nextCursor } = pageById(rows, limit);
    return NextResponse.json({ items: selected, nextCursor });
  }

  if (resource === "exploratory_session") {
    const id = searchParams.get("id") ?? "";
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid exploratory session id", code: "INVALID_ID" }, { status: 400 });
    const session = await readExploratorySession(workspaceId, id);
    if (!session) return NextResponse.json({ error: "Exploratory session not found", code: "SESSION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json(session);
  }

  if (resource === "runs" && (assigneeId || searchParams.has("source") || searchParams.has("cursor") || searchParams.has("status") ||
      searchParams.has("limit") || new URL(request.url).pathname === "/api/v1/agent")) {
    const cursor = cursorId(searchParams);
    const source = searchParams.get("source");
    const status = z.enum(runStatusEnum.enumValues).optional().safeParse(searchParams.get("status") ?? undefined);
    if (cursor === null || !status.success || (source !== null && source !== "exploratory")) {
      return NextResponse.json({ error: "Invalid status, source, or cursor", code: "INVALID_FILTER" }, { status: 400 });
    }
    const limit = parseLimitParam(searchParams.get("limit"), 50);
    const rows = await db.query.runs.findMany({ where: and(
      eq(runs.workspaceId, workspaceId),
      cursor ? lt(runs.id, cursor) : undefined,
      status.data ? eq(runs.status, status.data) : undefined,
      source ? eq(runs.source, source) : undefined,
      assigneeId ? or(
        eq(runs.assigneeId, assigneeId),
        inArray(runs.id, db.select({ id: runResults.runId }).from(runResults).where(eq(runResults.assigneeId, assigneeId))),
      ) : undefined,
    ), orderBy: [desc(runs.id)], limit: limit + 1 });
    const { selected, nextCursor } = pageById(rows, limit);
    return NextResponse.json({ runs: selected, nextCursor });
  }

  if (resource === "runs") {
    const rows = await db.query.runs.findMany({
      where: eq(runs.workspaceId, workspaceId),
      orderBy: [desc(runs.updatedAt)],
      limit: 50,
      with: { results: true },
    });
    return NextResponse.json({ runs: rows });
  }

  if (resource === "workflow_request") {
    const id = searchParams.get("id") ?? "";
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid request id", code: "INVALID_ID" }, { status: 400 });
    const result = await readRunnerRequest(workspaceId, id);
    if (!result) return NextResponse.json({ error: "Workflow request not found", code: "WORKFLOW_REQUEST_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ request: result });
  }

  if (resource === "result") {
    const id = searchParams.get("id") ?? "";
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid result id", code: "INVALID_ID" }, { status: 400 });
    const projectRunIds = db.select({ id: runs.id }).from(runs).where(eq(runs.workspaceId, workspaceId));
    const row = await db.query.runResults.findFirst({
      where: and(eq(runResults.id, id), inArray(runResults.runId, projectRunIds)),
      with: {
        case: true, run: true, stepResults: true,
        attachments: {
          columns: { id: true, filename: true, contentType: true, sizeBytes: true, kind: true, createdAt: true },
          orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
        },
      },
    });
    if (!row) return NextResponse.json({ error: "Result not found", code: "RESULT_NOT_FOUND" }, { status: 404 });
    const result = {
      ...row,
      attachments: row.attachments.map((item) => ({ ...item, url: `/api/attachments/${item.id}` })),
    };
    return NextResponse.json({ result, href: `/runs/${row.runId}` });
  }

  if (resource === "results") {
    const runId = searchParams.get("runId");
    const status = z.enum(resultStatusEnum.enumValues).optional().safeParse(searchParams.get("status") ?? undefined);
    const rawCursor = searchParams.get("cursor");
    const cursor = decodeListCursor(rawCursor);
    if (!status.success || (rawCursor !== null && !isUuid(cursor?.id ?? ""))) {
      return NextResponse.json({ error: "Invalid status or cursor" }, { status: 400 });
    }
    if (runId && !isUuid(runId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const projectRuns = db.select({ id: runs.id }).from(runs).where(and(
      eq(runs.workspaceId, workspaceId),
      runId ? eq(runs.id, runId) : undefined,
    ));
    if (runId && (await projectRuns).length === 0) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    const limit = searchParams.has("limit") ? parseLimitParam(searchParams.get("limit"), 100) : 200;
    const rows = await db.query.runResults.findMany({
      where: and(
        inArray(runResults.runId, projectRuns),
        status.data ? eq(runResults.status, status.data) : undefined,
        cursor ? lt(runResults.id, cursor.id) : undefined,
        assigneeId ? or(
          eq(runResults.assigneeId, assigneeId),
          and(
            isNull(runResults.assigneeId),
            inArray(runResults.runId, db.select({ id: runs.id }).from(runs).where(and(
              eq(runs.workspaceId, workspaceId), eq(runs.assigneeId, assigneeId),
            ))),
          ),
        ) : undefined,
      ),
      with: { case: true, run: true },
      orderBy: [desc(runResults.id)],
      limit: limit + 1,
    });
    const results = rows.slice(0, limit);
    const last = results.at(-1);
    return NextResponse.json({
      results,
      nextCursor: rows.length > limit && last ? encodeListCursor({ id: last.id, sortValue: "" }) : null,
    });
  }

  if (resource === "whats_pending") {
    return NextResponse.json(await whatsPending(workspaceId));
  }

  if (resource === "scenario_context") {
    const q = searchParams.get("q") ?? "";
    return NextResponse.json(await getScenarioContext(workspaceId, q));
  }

  if (resource === "intents") {
    const { listIntentsWithMeta, getIntentDetail } = await import(
      "@/lib/quality-graph"
    );
    const id = searchParams.get("id");
    const key = searchParams.get("key");
    if (id || key) {
      const intent = await getIntentDetail(workspaceId, id ?? key!);
      if (!intent) {
        return NextResponse.json({ error: "Intent not found" }, { status: 404 });
      }
      return NextResponse.json({ intent });
    }
    const q = searchParams.get("q")?.toLowerCase();
    let intents = await listIntentsWithMeta(workspaceId);
    if (q) {
      intents = intents.filter(
        (i) =>
          i.key.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.behavior.toLowerCase().includes(q),
      );
    }
    return NextResponse.json({ intents });
  }

  if (resource === "coverage") {
    const { getWorkspaceCoverage, filterCoverageReport } = await import(
      "@/lib/quality-graph"
    );
    const filter = searchParams.get("filter");
    const coverage = filterCoverageReport(
      await getWorkspaceCoverage(workspaceId),
      filter,
    );
    return NextResponse.json({ coverage });
  }

  if (resource === "requirement") {
    const { getRequirementDetail } = await import("@/lib/quality-graph");
    const id = searchParams.get("id");
    const key = searchParams.get("key");
    if (!id && !key) {
      return NextResponse.json(
        { error: "id or key is required" },
        { status: 400 },
      );
    }
    const requirement = await getRequirementDetail(workspaceId, id ?? key!);
    if (!requirement) {
      return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
    }
    return NextResponse.json({ requirement });
  }

  if (resource === "execution_history") {
    const { getExecutionHistory } = await import("@/lib/quality-graph");
    const intentId = searchParams.get("intentId") ?? undefined;
    const intentKey = searchParams.get("intentKey") ?? undefined;
    const implementationId = searchParams.get("implementationId") ?? undefined;
    if (!intentId && !intentKey && !implementationId) {
      return NextResponse.json(
        { error: "intentId, intentKey, or implementationId is required" },
        { status: 400 },
      );
    }
    const limitRaw = searchParams.get("limit");
    let limit: number | undefined;
    if (limitRaw != null) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
      }
      limit = n;
    }
    const history = await getExecutionHistory(workspaceId, {
      intentId,
      intentKey,
      implementationId,
      limit,
    });
    return NextResponse.json(history);
  }

  if (resource === "failure_evidence") {
    const { getFailureEvidence } = await import("@/lib/quality-graph");
    const resultId = searchParams.get("resultId") ?? undefined;
    const signatureId = searchParams.get("signatureId") ?? undefined;
    if (!resultId && !signatureId) {
      return NextResponse.json(
        { error: "resultId or signatureId is required" },
        { status: 400 },
      );
    }
    if (resultId && !z.string().uuid().safeParse(resultId).success) {
      return NextResponse.json({ error: "Invalid resultId" }, { status: 400 });
    }
    if (signatureId && !z.string().uuid().safeParse(signatureId).success) {
      return NextResponse.json({ error: "Invalid signatureId" }, { status: 400 });
    }
    const evidence = await getFailureEvidence(workspaceId, {
      resultId,
      signatureId,
    });
    if (!evidence) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    }
    return NextResponse.json({ evidence });
  }

  return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
}

const createCaseSchema = z.object({
  action: z.literal("create_case"),
  title: z.string().min(1),
  key: z.string().optional(),
  description: z.string().optional().default(""),
  steps: z.string().optional().default(""),
  expectedResult: z.string().optional().default(""),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  tags: z.array(z.string()).optional().default([]),
});

const createRunSchema = z.object({
  action: z.literal("create_run"),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  caseIds: z.array(z.string().uuid()).optional(),
  caseKeys: z.array(z.string()).optional(),
});

const recordResultSchema = z.object({
  action: z.literal("record_result"),
  runId: z.string().uuid(),
  resultId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  caseKey: z.string().optional(),
  status: z.enum(["untested", "passed", "failed", "blocked", "skipped"]),
  notes: z.string().optional().default(""),
});

const createIssueSchema = z.object({
  action: z.literal("create_issue"),
  resultId: z.string().uuid(),
  provider: z.enum(["mock", "jira", "linear", "github"]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const createTestIntentSchema = z.object({
  action: z.literal("create_test_intent"),
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  behavior: z.string().optional().default(""),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  status: z
    .enum(["draft", "ready", "blocked", "deprecated"])
    .optional()
    .default("ready"),
});

const proposeCoverageSchema = z.object({
  action: z.literal("propose_coverage"),
  payload: z.unknown(),
  entityType: z.string().min(1).max(64).optional(),
  actorType: z.enum(["user", "agent", "model"]).optional().default("agent"),
  model: z.string().max(120).nullable().optional(),
  inputRefs: z.array(z.string()).optional(),
});

const linkIssueSchema = z.object({
  action: z.literal("link_issue"),
  resultId: z.string().uuid(),
  remoteKey: z.string().min(1),
  provider: z.enum(["mock", "jira", "linear", "github"]).optional(),
});

const linkAutomationSchema = z
  .object({
    action: z.literal("link_automation"),
    implementationId: z.string().uuid().optional(),
    externalKey: z.string().min(1).optional(),
    intentId: z.string().uuid().optional(),
    intentKey: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.implementationId || b.externalKey), {
    message: "implementationId or externalKey is required",
  })
  .refine((b) => Boolean(b.intentId || b.intentKey), {
    message: "intentId or intentKey is required",
  });

const compareReleasesSchema = z
  .object({
    action: z.literal("compare_releases"),
    beforeReleaseId: z.string().uuid().optional(),
    afterReleaseId: z.string().uuid().optional(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  })
  .refine(
    (b) =>
      (b.beforeReleaseId && b.afterReleaseId) ||
      (b.before !== undefined && b.after !== undefined),
    {
      message:
        "Provide beforeReleaseId and afterReleaseId, or before and after snapshots",
    },
  );

export async function POST(request: Request) {
  const authResult = await authenticateApiToken(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  const workspaceId = authResult.workspaceId;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const body = json.body;
  const action =
    body && typeof body === "object" && "action" in body
      ? (body as { action?: unknown }).action
      : undefined;

  const versioned = new URL(request.url).pathname === "/api/v1/agent";
  const scoped = authResult.scopes.some((scope) => scope.startsWith("agent-"));
  if (versioned || scoped) {
    try {
      const result = await runAgentOperation(authResult, request.headers.get("Idempotency-Key"), body);
      return NextResponse.json(result.body, { status: result.status });
    } catch (err) {
      if (err instanceof AgentOperationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: "Resource already exists", code: "RESOURCE_CONFLICT" }, { status: 409 });
      }
      console.error("Agent operation failed", err instanceof Error ? err.name : "unknown");
      return NextResponse.json({ error: "Agent operation failed", code: "OPERATION_FAILED" }, { status: 500 });
    }
  }

  if (!authResult.scopes.includes("agent")) {
    return NextResponse.json({ error: "Token scope insufficient", code: "CAPABILITY_REQUIRED" }, { status: 403 });
  }
  // Keep side-effect-free legacy methods available during and after cutover.
  if (action !== "compare_releases" && authResult.tokenId) {
    const [project] = await db.select({
      legacyAgentWrites: workspaces.legacyAgentWrites,
      archivedAt: workspaces.archivedAt,
    }).from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!project?.legacyAgentWrites || project.archivedAt) {
      return NextResponse.json({
        error: "Legacy agent writes are disabled. Use project-scoped agent capabilities.",
        code: "LEGACY_WRITE_DISABLED",
      }, { status: 403 });
    }
  }

  try {
    if (action === "create_case") {
      const parsed = createCaseSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const created = await db.transaction(async (tx) => {
        if (await lockCaseReviewPolicy(tx, workspaceId)) return null;
        const [{ value: caseCount }] = await tx
          .select({ value: count() })
          .from(cases)
          .where(eq(cases.workspaceId, workspaceId));
        const key = parsed.data.key ?? `TOP-${Number(caseCount) + 1}`;
        const [row] = await tx
          .insert(cases)
          .values({
            workspaceId,
            key,
            title: parsed.data.title,
            description: parsed.data.description,
            steps: parsed.data.steps,
            expectedResult: parsed.data.expectedResult,
            priority: parsed.data.priority,
            status: "ready",
            tags: parsed.data.tags,
            createdById: authResult.userId,
          })
          .returning();
        const { ensureIntentForCase } = await import("@/lib/quality-graph");
        const { intentId } = await ensureIntentForCase(row, tx);
        return { ...row, intentId };
      });
      if (!created) return NextResponse.json(caseReviewRequired, { status: 409 });
      return NextResponse.json({ case: created });
    }

    if (action === "create_run") {
      const parsed = createRunSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      let caseRows: Array<typeof cases.$inferSelect> = [];
      if (parsed.data.caseIds?.length) {
        caseRows = await db.query.cases.findMany({
          where: and(
            inArray(cases.id, parsed.data.caseIds),
            eq(cases.workspaceId, workspaceId),
          ),
        });
      } else if (parsed.data.caseKeys?.length) {
        caseRows = await db.query.cases.findMany({
          where: and(
            inArray(cases.key, parsed.data.caseKeys),
            eq(cases.workspaceId, workspaceId),
          ),
        });
      } else {
        caseRows = await db.query.cases.findMany({
          where: and(eq(cases.status, "ready"), eq(cases.workspaceId, workspaceId)),
          limit: 50,
        });
      }

      const run = await db.transaction(async (tx) => {
        if (await lockCaseReviewPolicy(tx, workspaceId) &&
          !await allCasesReady(tx, workspaceId, caseRows.map((row) => row.id))) return null;
        const [created] = await tx.insert(runs).values({
          workspaceId,
          name: parsed.data.name,
          description: parsed.data.description,
          status: "planned",
          createdById: authResult.userId,
        }).returning();
        await seedManualRunResults({
          workspaceId,
          runId: created.id,
          caseIds: caseRows.map((row) => row.id),
        }, tx);
        return created;
      });

      if (!run) return NextResponse.json({ code: "CASE_REVIEW_REQUIRED", error: "Select ready cases to start this run." }, { status: 409 });
      return NextResponse.json({ run, caseCount: caseRows.length });
    }

    if (action === "record_result") {
      const parsed = recordResultSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const { runId, resultId, status, notes } = parsed.data;
      const outcome = await db.transaction(async (tx) => {
        const [run] = await tx.select().from(runs).where(and(
          eq(runs.id, runId),
          eq(runs.workspaceId, workspaceId),
        )).for("update");
        if (!run) return { error: "Run not found", status: 404 } as const;
        if (isRunFrozen(run.status)) return { error: immutableMessageFor(run.status), status: 409 } as const;

        let caseId = parsed.data.caseId;
        if (!resultId && !caseId && parsed.data.caseKey) {
          const found = await tx.query.cases.findFirst({ where: and(
            eq(cases.key, parsed.data.caseKey),
            eq(cases.workspaceId, workspaceId),
          ) });
          caseId = found?.id;
        }
        if (!resultId && !caseId) return { error: "caseId or resultId required", status: 400 } as const;
        const selected = await tx.query.runResults.findMany({ where: and(
          eq(runResults.runId, runId),
          resultId ? eq(runResults.id, resultId) : eq(runResults.caseId, caseId!),
        ), limit: 2 });
        if (selected.length > 1) return { error: "Multiple iterations match. Provide resultId", status: 409 } as const;
        if (!selected.length) return { error: "Result not found", status: 404 } as const;
        const [updated] = await tx.update(runResults).set({
          status, notes, executedById: authResult.userId, executedAt: new Date(),
        }).where(eq(runResults.id, selected[0].id)).returning();
        return { updated };
      });
      if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      const { updated } = outcome;
      if (updated.status === "failed" || updated.status === "blocked") {
        await openTriageForResult(updated.id);
      }
      if (updated.status === "passed" && updated.caseId) {
        try {
          await syncIssuesOnPassingRetest({ workspaceId, caseId: updated.caseId });
        } catch {
          // Outbound close is best-effort during legacy compatibility.
        }
      }
      return NextResponse.json({ result: updated });
    }

    if (action === "create_issue") {
      const parsed = createIssueSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const issue = await createIssueFromResult({
        ...parsed.data,
        userId: authResult.userId,
        workspaceId,
      });
      return NextResponse.json({ issue });
    }

    if (action === "create_test_intent") {
      const parsed = createTestIntentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const [intent] = await db
        .insert(testIntents)
        .values({
          workspaceId,
          key: parsed.data.key,
          title: parsed.data.title,
          behavior: parsed.data.behavior,
          criticality: parsed.data.criticality,
          status: parsed.data.status,
        })
        .returning();
      return NextResponse.json({ intent }, { status: 201 });
    }

    if (action === "propose_coverage") {
      const parsed = proposeCoverageSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const { validateProposalPayload } = await import("@topology/domain");
      const validated = validateProposalPayload(parsed.data.payload);
      if (!validated.ok) {
        return NextResponse.json(
          { error: "Invalid proposal payload", issues: validated.issues },
          { status: 400 },
        );
      }
      const { createProposal, toProposalListItem } = await import(
        "@/lib/proposals"
      );
      const row = await createProposal({
        workspaceId,
        payload: validated.payload,
        entityType: parsed.data.entityType,
        actorType: parsed.data.actorType,
        model: parsed.data.model ?? null,
        inputRefs: parsed.data.inputRefs,
        createdById: authResult.userId,
      });
      return NextResponse.json(
        {
          proposal: toProposalListItem(row),
          message:
            "Proposal queued as pending. It will not write to the graph until a human accepts it.",
        },
        { status: 201 },
      );
    }

    if (action === "link_issue") {
      const parsed = linkIssueSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const issue = await linkExistingIssue({
        ...parsed.data,
        userId: authResult.userId,
        workspaceId,
      });
      return NextResponse.json({ issue });
    }

    if (action === "link_automation") {
      const parsed = linkAutomationSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const {
        LinkImplementationError,
        linkImplementationToIntent,
      } = await import("@/lib/quality-graph");

      let implementationId = parsed.data.implementationId;
      if (!implementationId && parsed.data.externalKey) {
        const impl = await db.query.testImplementations.findFirst({
          where: and(
            eq(testImplementations.workspaceId, workspaceId),
            eq(testImplementations.externalKey, parsed.data.externalKey),
          ),
        });
        if (!impl) {
          return NextResponse.json(
            { error: "Implementation not found" },
            { status: 404 },
          );
        }
        implementationId = impl.id;
      }

      let intentId = parsed.data.intentId;
      if (!intentId && parsed.data.intentKey) {
        const intent = await db.query.testIntents.findFirst({
          where: and(
            eq(testIntents.workspaceId, workspaceId),
            eq(testIntents.key, parsed.data.intentKey),
          ),
        });
        if (!intent) {
          return NextResponse.json({ error: "Intent not found" }, { status: 404 });
        }
        intentId = intent.id;
      }

      if (!implementationId || !intentId) {
        return NextResponse.json({ error: "Invalid link request" }, { status: 400 });
      }

      try {
        const linked = await linkImplementationToIntent(
          workspaceId,
          implementationId,
          intentId,
        );
        return NextResponse.json({ ok: true, ...linked });
      } catch (err) {
        if (err instanceof LinkImplementationError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
    }

    if (action === "compare_releases") {
      const parsed = compareReleasesSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const { compareReleaseSnapshots } = await import("@/lib/release-quality");
      const { beforeReleaseId, afterReleaseId, before, after } = parsed.data;
      const result = await compareReleaseSnapshots(
        workspaceId,
        beforeReleaseId && afterReleaseId
          ? { beforeReleaseId, afterReleaseId }
          : { before, after },
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        comparison: result.comparison,
        ...(result.beforeReleaseId
          ? {
              beforeReleaseId: result.beforeReleaseId,
              afterReleaseId: result.afterReleaseId,
            }
          : {}),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    if (err instanceof Error && err.message === "Result not found") {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "Already exists" }, { status: 409 });
    }
    return dbErrorResponse(err, "Agent API failed");
  }
}
