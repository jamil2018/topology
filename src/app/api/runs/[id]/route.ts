import { NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { runResults, runs } from "@/db/schema";
import { parseAssigneeInput, requireWorkspaceAssignee } from "@/lib/assignee";
import { openTriageForResult } from "@/lib/ci-ingest";
import { isLockFailure } from "@/lib/pg-error";
import { requireProjectAccess } from "@/lib/project";
import { pendingResultCount } from "@/lib/run-immutability";
import {
  immutableMessageFor,
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

function invalidId(id: string) {
  return !z.string().uuid().safeParse(id).success;
}

async function rejectAssignee(workspaceId: string, assigneeId: string | null) {
  if (!assigneeId) return null;
  const assignee = await requireWorkspaceAssignee(
    workspaceId,
    assigneeId,
    "runs.edit",
  );
  if (assignee.ok) return null;
  return NextResponse.json(
    { error: assignee.error },
    { status: assignee.status },
  );
}

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
  if (invalidId(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

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

  const { id } = await params;
  if (invalidId(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action =
    body && typeof body === "object" && "action" in body
      ? (body as { action?: unknown }).action
      : undefined;
  const neededAction =
    action === "complete"
      ? ("runs.complete" as const)
      : action === "abort"
        ? ("runs.delete" as const)
        : ("runs.edit" as const);

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: neededAction,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const existing = await db.query.runs.findFirst({
    where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "abort") {
    if (existing.status === "aborted") {
      return NextResponse.json({ run: existing });
    }
    if (isRunFrozen(existing.status)) {
      return runImmutableResponse(immutableMessageFor(existing.status));
    }
    const [updated] = await db
      .update(runs)
      .set({
        status: "aborted",
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
      .returning();
    return NextResponse.json({ run: updated });
  }

  if (action === "start") {
    if (isRunFrozen(existing.status)) {
      return runImmutableResponse(immutableMessageFor(existing.status));
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

  if (action === "complete") {
    try {
      const outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(runs)
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
          .limit(1)
          .for("update");
        if (!locked) return { kind: "missing" as const };
        if (locked.status === "completed") {
          return { kind: "already" as const, run: locked };
        }
        if (isRunFrozen(locked.status)) {
          return { kind: "frozen" as const, status: locked.status };
        }

        const results = await tx
          .select({ status: runResults.status })
          .from(runResults)
          .where(eq(runResults.runId, id))
          .orderBy(runResults.id)
          .for("update");
        const pending = pendingResultCount(results.map((row) => row.status));
        if (pending > 0) return { kind: "pending" as const, pending };

        const [updated] = await tx
          .update(runs)
          .set({
            status: "completed",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(runs.id, id),
              eq(runs.workspaceId, workspaceId),
              notInArray(runs.status, ["completed", "aborted"]),
            ),
          )
          .returning();
        if (!updated) return { kind: "conflict" as const };
        return { kind: "completed" as const, run: updated };
      });

      if (outcome.kind === "missing") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (outcome.kind === "already") {
        return NextResponse.json({ run: outcome.run });
      }
      if (outcome.kind === "frozen") {
        return runImmutableResponse(immutableMessageFor(outcome.status));
      }
      if (outcome.kind === "pending") {
        return NextResponse.json(
          {
            error: "Cannot complete a run while results are still untested",
          },
          { status: 409 },
        );
      }
      if (outcome.kind === "conflict") {
        const current = await db.query.runs.findFirst({
          where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)),
        });
        if (current?.status === "completed") {
          return NextResponse.json({ run: current });
        }
        return runImmutableResponse(immutableMessageFor(current?.status));
      }

      const data = await buildRunCompletedPayload(id);
      if (data) {
        void dispatchWebhook("run.completed", data, workspaceId);
      }
      try {
        const { refreshImplementationStatsForRun } = await import(
          "@/lib/implementation-stats"
        );
        await refreshImplementationStatsForRun(id);
      } catch {
        // Rollups are best-effort; the run is already completed.
      }
      return NextResponse.json({ run: outcome.run });
    } catch (err) {
      if (isLockFailure(err)) {
        return NextResponse.json(
          { error: "Could not lock the run to complete it. Retry." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Failed to complete run" },
        { status: 500 },
      );
    }
  }

  if (action === "assign") {
    const payload = body as { assigneeId?: unknown };
    const parsedAssignee = parseAssigneeInput(payload.assigneeId);
    if (!parsedAssignee.ok) {
      return NextResponse.json(
        { error: parsedAssignee.error },
        { status: 400 },
      );
    }
    const rejected = await rejectAssignee(
      workspaceId,
      parsedAssignee.assigneeId,
    );
    if (rejected) return rejected;

    try {
      const outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(runs)
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
          .limit(1)
          .for("update");
        if (!locked) return { kind: "missing" as const };
        if (isRunFrozen(locked.status)) {
          return { kind: "frozen" as const, status: locked.status };
        }
        const [updated] = await tx
          .update(runs)
          .set({
            assigneeId: parsedAssignee.assigneeId,
            updatedAt: new Date(),
          })
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
          .returning();
        return { kind: "ok" as const, run: updated };
      });
      if (outcome.kind === "missing") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (outcome.kind === "frozen") {
        return runImmutableResponse(immutableMessageFor(outcome.status));
      }
      return NextResponse.json({ run: outcome.run });
    } catch (err) {
      if (isLockFailure(err)) {
        return NextResponse.json(
          { error: "Could not lock the run to assign it. Retry." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Failed to assign run" },
        { status: 500 },
      );
    }
  }

  if (action === "assign_result") {
    const payload = body as { resultId?: unknown; assigneeId?: unknown };
    const resultId = z.string().uuid().safeParse(payload.resultId);
    if (!resultId.success) {
      return NextResponse.json({ error: "Invalid result id" }, { status: 400 });
    }
    const parsedAssignee = parseAssigneeInput(payload.assigneeId);
    if (!parsedAssignee.ok) {
      return NextResponse.json(
        { error: parsedAssignee.error },
        { status: 400 },
      );
    }
    const rejected = await rejectAssignee(
      workspaceId,
      parsedAssignee.assigneeId,
    );
    if (rejected) return rejected;

    try {
      const outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ status: runs.status })
          .from(runs)
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
          .limit(1)
          .for("update");
        if (!locked) return { kind: "missing" as const };
        if (isRunFrozen(locked.status)) {
          return { kind: "frozen" as const, status: locked.status };
        }
        const [updated] = await tx
          .update(runResults)
          .set({ assigneeId: parsedAssignee.assigneeId })
          .where(
            and(eq(runResults.runId, id), eq(runResults.id, resultId.data)),
          )
          .returning();
        if (!updated) return { kind: "result-missing" as const };
        return { kind: "ok" as const, result: updated };
      });
      if (outcome.kind === "missing") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (outcome.kind === "frozen") {
        return runImmutableResponse(immutableMessageFor(outcome.status));
      }
      if (outcome.kind === "result-missing") {
        return NextResponse.json({ error: "Result not found" }, { status: 404 });
      }
      return NextResponse.json({ result: outcome.result });
    } catch (err) {
      if (isLockFailure(err)) {
        return NextResponse.json(
          { error: "Could not lock the run to assign it. Retry." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Failed to assign result" },
        { status: 500 },
      );
    }
  }

  const parsed = updateResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (isRunFrozen(existing.status)) {
    return runImmutableResponse(immutableMessageFor(existing.status));
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

  if (updated.status === "failed" || updated.status === "blocked") {
    await openTriageForResult(updated.id);
  }

  return NextResponse.json({ result: updated });
}
