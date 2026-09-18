import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, runResults, runs } from "@/db/schema";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import { caseWriteError } from "@/lib/pg-error";
import { requireProjectAccess } from "@/lib/project";
import { listRuns } from "@/lib/queries";

/** Create a manual run. `caseIds` must list at least one case. */
const createRunSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().default(""),
  environment: z.string().optional().default("local"),
  caseIds: z.array(z.string().uuid()).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const data = await listRuns(access.ctx.project.id);
  return NextResponse.json({ runs: data });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "runs.create",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const caseIds = parsed.data.caseIds ?? [];
  if (caseIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one case" },
      { status: 400 },
    );
  }

  const found = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(inArray(cases.id, caseIds), eq(cases.workspaceId, workspaceId)));
  if (found.length !== caseIds.length) {
    return NextResponse.json(
      { error: "One or more case ids are invalid" },
      { status: 400 },
    );
  }

  if (parsed.data.assigneeId) {
    const assignee = await requireWorkspaceAssignee(
      workspaceId,
      parsed.data.assigneeId,
      "runs.edit",
    );
    if (!assignee.ok) {
      return NextResponse.json(
        { error: assignee.error },
        { status: assignee.status },
      );
    }
  }

  try {
    const [run] = await db
      .insert(runs)
      .values({
        workspaceId,
        name: parsed.data.name,
        description: parsed.data.description,
        environment: parsed.data.environment,
        createdById: session.user.id,
        assigneeId: parsed.data.assigneeId ?? null,
        status: "planned",
        kind: "manual",
        source: "manual",
      })
      .returning();

    await db.insert(runResults).values(
      caseIds.map((caseId) => ({
        runId: run.id,
        caseId,
        status: "untested" as const,
      })),
    );

    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    const mapped = caseWriteError(err);
    if (mapped) {
      return NextResponse.json(
        { error: mapped.error },
        { status: mapped.status },
      );
    }
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }
}
