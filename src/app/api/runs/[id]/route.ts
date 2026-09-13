import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { runResults, runs } from "@/db/schema";
import { openTriageForResult } from "@/lib/ci-ingest";
import { requireProjectAccess } from "@/lib/project";
import {
  isRunFrozen,
  runImmutableResponse,
} from "@/lib/run-immutability-http";
import {
  buildRunCompletedPayload,
  dispatchWebhook,
} from "@/lib/webhooks";

const updateResultSchema = z.object({
  caseId: z.string().uuid(),
  status: z.enum(["untested", "passed", "failed", "blocked", "skipped"]),
  notes: z.string().optional().default(""),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { id } = await params;
  const run = await db.query.runs.findFirst({
    where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)),
    with: {
      results: {
        with: { case: true },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    write: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { id } = await params;
  const existing = await db.query.runs.findFirst({
    where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  if (body?.action === "start") {
    if (isRunFrozen(existing.status)) {
      return runImmutableResponse();
    }
    const [updated] = await db
      .update(runs)
      .set({
        status: "in_progress",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
      .returning();
    return NextResponse.json({ run: updated });
  }

  if (body?.action === "complete") {
    if (isRunFrozen(existing.status)) {
      // Idempotent: already completed — do not re-dispatch or rewrite.
      return NextResponse.json({ run: existing });
    }
    const [updated] = await db
      .update(runs)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
      .returning();

    const data = await buildRunCompletedPayload(id);
    if (data) {
      void dispatchWebhook("run.completed", data, workspaceId);
    }

    return NextResponse.json({ run: updated });
  }

  if (body?.action === "assign") {
    const assigneeId =
      body.assigneeId === null || body.assigneeId === ""
        ? null
        : z.string().uuid().parse(body.assigneeId);
    const [updated] = await db
      .update(runs)
      .set({
        assigneeId,
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
      .returning();
    return NextResponse.json({ run: updated });
  }

  if (body?.action === "assign_result") {
    const resultId = z.string().uuid().parse(body.resultId);
    const assigneeId =
      body.assigneeId === null || body.assigneeId === ""
        ? null
        : z.string().uuid().parse(body.assigneeId);
    const [updated] = await db
      .update(runResults)
      .set({ assigneeId })
      .where(and(eq(runResults.runId, id), eq(runResults.id, resultId)))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }
    return NextResponse.json({ result: updated });
  }

  const parsed = updateResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (isRunFrozen(existing.status)) {
    return runImmutableResponse();
  }

  const [updated] = await db
    .update(runResults)
    .set({
      status: parsed.data.status,
      notes: parsed.data.notes,
      executedById: session.user.id,
      executedAt: new Date(),
    })
    .where(
      and(
        eq(runResults.runId, id),
        eq(runResults.caseId, parsed.data.caseId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  await db
    .update(runs)
    .set({
      status: "in_progress",
      startedAt: existing.startedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)));

  if (parsed.data.status === "failed") {
    await openTriageForResult(updated.id);
  }

  return NextResponse.json({ result: updated });
}
