import { NextResponse } from "next/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { authenticateApiToken } from "@/lib/api-auth";
import { db } from "@/db";
import { cases, runResults, runs } from "@/db/schema";
import {
  createIssueFromResult,
  getScenarioContext,
  linkExistingIssue,
  whatsPending,
} from "@/lib/issues";
import {
  isRunFrozen,
  runImmutableResponse,
} from "@/lib/run-immutability";

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

const linkIssueSchema = z.object({
  action: z.literal("link_issue"),
  resultId: z.string().uuid(),
  remoteKey: z.string().min(1),
  provider: z.enum(["mock", "jira", "linear", "github"]).optional(),
});

export async function POST(request: Request) {
  const authResult = await requireToken(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  const workspaceId = authResult.workspaceId;

  const body = await request.json();
  const action = body?.action;

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
      return NextResponse.json({ case: row });
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
        return runImmutableResponse();
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
      });
      return NextResponse.json({ issue });
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
      });
      return NextResponse.json({ issue });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent API failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
