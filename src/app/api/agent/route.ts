import { NextResponse } from "next/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { authenticateApiToken } from "@/lib/api-auth";
import { dbErrorResponse, isUniqueViolation, readJsonBody } from "@/lib/http-errors";
import { db } from "@/db";
import { cases, runResults, runs, testImplementations, testIntents } from "@/db/schema";
import {
  createIssueFromResult,
  getScenarioContext,
  linkExistingIssue,
  whatsPending,
} from "@/lib/issues";
import { openTriageForResult } from "@/lib/ci-ingest";
import {
  immutableMessageFor,
  isRunFrozen,
  runImmutableResponse,
} from "@/lib/run-immutability-http";

async function requireToken(request: Request) {
  return authenticateApiToken(request);
}

export async function GET(request: Request) {
  const authResult = await requireToken(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  const workspaceId = authResult.workspaceId;

  const { searchParams } = new URL(request.url);
  const resource = searchParams.get("resource") ?? "cases";

  if (resource === "cases") {
    const q = searchParams.get("q")?.toLowerCase();
    let rows = await db.query.cases.findMany({
      where: eq(cases.workspaceId, workspaceId),
      orderBy: [desc(cases.updatedAt)],
      limit: 100,
    });
    if (q) {
      rows = rows.filter(
        (c) =>
          c.key.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return NextResponse.json({ cases: rows });
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

  if (resource === "results") {
    const runId = searchParams.get("runId");
    const status = searchParams.get("status");
    if (runId && !z.string().uuid().safeParse(runId).success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    if (runId) {
      const run = await db.query.runs.findFirst({
        where: and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)),
      });
      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
    }
    const rows = await db.query.runResults.findMany({
      where: runId ? eq(runResults.runId, runId) : undefined,
      with: { case: true, run: true },
      limit: 200,
    });
    const scoped = rows.filter((r) => r.run?.workspaceId === workspaceId);
    const filtered = status ? scoped.filter((r) => r.status === status) : scoped;
    return NextResponse.json({ results: filtered });
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
  const authResult = await requireToken(request);
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

  try {
    if (action === "create_case") {
      const parsed = createCaseSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const [{ value: caseCount }] = await db
        .select({ value: count() })
        .from(cases)
        .where(eq(cases.workspaceId, workspaceId));
      const key = parsed.data.key ?? `TOP-${Number(caseCount) + 1}`;
      const [row] = await db
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
      const { intentId } = await ensureIntentForCase(row);
      return NextResponse.json({ case: { ...row, intentId } });
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

      const [run] = await db
        .insert(runs)
        .values({
          workspaceId,
          name: parsed.data.name,
          description: parsed.data.description,
          status: "planned",
          createdById: authResult.userId,
        })
        .returning();

      if (caseRows.length) {
        await db.insert(runResults).values(
          caseRows.map((c) => ({
            runId: run.id,
            caseId: c.id,
            status: "untested" as const,
          })),
        );
      }

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
      const run = await db.query.runs.findFirst({
        where: and(
          eq(runs.id, parsed.data.runId),
          eq(runs.workspaceId, workspaceId),
        ),
      });
      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
      if (isRunFrozen(run.status)) {
        return runImmutableResponse(immutableMessageFor(run.status));
      }
      let caseId = parsed.data.caseId;
      if (!caseId && parsed.data.caseKey) {
        const c = await db.query.cases.findFirst({
          where: and(
            eq(cases.key, parsed.data.caseKey),
            eq(cases.workspaceId, workspaceId),
          ),
        });
        caseId = c?.id;
      }
      if (!caseId) {
        return NextResponse.json({ error: "caseId required" }, { status: 400 });
      }
      const [updated] = await db
        .update(runResults)
        .set({
          status: parsed.data.status,
          notes: parsed.data.notes,
          executedById: authResult.userId,
          executedAt: new Date(),
        })
        .where(
          and(
            eq(runResults.runId, parsed.data.runId),
            eq(runResults.caseId, caseId),
          ),
        )
        .returning();
      if (!updated) {
        return NextResponse.json({ error: "Result not found" }, { status: 404 });
      }
      if (updated.status === "failed" || updated.status === "blocked") {
        await openTriageForResult(updated.id);
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
