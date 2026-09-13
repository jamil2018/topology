import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, runResults, runs } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { listRuns } from "@/lib/queries";

/** Create a manual run.
 * `caseIds`: explicit cases to attach as untested results.
 * Omit / empty array → attach every case with status `ready` (legacy default).
 * The hub UI always sends an explicit non-empty selection.
 */
const createRunSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().default(""),
  environment: z.string().optional().default("local"),
  caseIds: z.array(z.string().uuid()).optional().default([]),
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

  const body = await request.json();
  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let caseIds = parsed.data.caseIds;
  if (caseIds.length === 0) {
    const ready = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.status, "ready"), eq(cases.workspaceId, workspaceId)));
    caseIds = ready.map((c) => c.id);
  } else {
    const found = await db
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(inArray(cases.id, caseIds), eq(cases.workspaceId, workspaceId)),
      );
    if (found.length !== caseIds.length) {
      return NextResponse.json(
        { error: "One or more case ids are invalid" },
        { status: 400 },
      );
    }
  }

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

  if (caseIds.length > 0) {
    await db.insert(runResults).values(
      caseIds.map((caseId) => ({
        runId: run.id,
        caseId,
        status: "untested" as const,
      })),
    );
  }

  return NextResponse.json({ run }, { status: 201 });
}
