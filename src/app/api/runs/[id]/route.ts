import { NextResponse } from "next/server";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { runResults, runStepResults, runs, notifications } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { parseAssigneeInput, requireWorkspaceAssignee } from "@/lib/assignee";
import { clampDurationMs, openTriageForResult } from "@/lib/ci-ingest";
import { isLockFailure } from "@/lib/pg-error";
import { requireProjectAccess } from "@/lib/project";
import {
  isReopenableRunStatus,
  pendingResultCount,
} from "@/lib/run-immutability";
import {
  immutableMessageFor,
  isRunFrozen,
  runImmutableResponse,
} from "@/lib/run-immutability-http";
import { syncIssuesOnPassingRetest } from "@/lib/issues";
import {
  buildRunCompletedPayload,
  dispatchWebhook,
} from "@/lib/webhooks";
import { emitLive } from "@/lib/live";

const resultStatusEnum = z.enum([
  "untested",
  "passed",
  "failed",
  "blocked",
  "skipped",
]);

const updateResultSchema = z
  .object({
    caseId: z.string().uuid(),
    resultId: z.string().uuid().optional(),
    status: resultStatusEnum.optional(),
    notes: z.string().optional().default(""),
    durationMs: z.number().int().min(0).nullable().optional(),
    stepResults: z
      .array(
        z.object({
          position: z.number().int().min(0),
          status: resultStatusEnum,
          notes: z.string().optional(),
        }),
      )
      .optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => v.status !== undefined || (v.stepResults && v.stepResults.length > 0), {
    message: "Provide a status or step results",
  });

const bulkResultsSchema = z
  .object({
    action: z.literal("bulk_results"),
    resultIds: z.array(z.string().uuid()).min(1).max(500),
    status: resultStatusEnum.optional(),
    assigneeId: z.unknown().optional(),
  })
  .refine((v) => v.status !== undefined || v.assigneeId !== undefined, {
    message: "Provide a status and/or assigneeId",
  });

type Params = { params: Promise<{ id: string }> };

function invalidId(id: string) {
  return !z.string().uuid().safeParse(id).success;
}

function liveRun(
  workspaceId: string,
  runId: string,
  extra: {
    resultId?: string;
    status?: string;
    assigneeId?: string | null;
    runStatus?: string;
  } = {},
) {
  emitLive({
    workspaceId,
    topic: "run",
    entityId: runId,
    ...extra,
  });
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
        with: { case: true, stepResults: true },
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
    action === "complete" || action === "reopen"
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
    liveRun(workspaceId, id, { runStatus: "aborted" });
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
    liveRun(workspaceId, id, { runStatus: "in_progress" });
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
        void import("@/lib/notification-channels")
          .then(({ dispatchNotificationChannels }) =>
            dispatchNotificationChannels("run.completed", data, workspaceId),
          )
          .catch(() => {});
      }
      try {
        const { refreshImplementationStatsForRun } = await import(
          "@/lib/implementation-stats"
        );
        await refreshImplementationStatsForRun(id);
      } catch {
        // Rollups are best-effort; the run is already completed.
      }
      liveRun(workspaceId, id, { runStatus: "completed" });
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

  if (action === "reopen") {
    if (!isReopenableRunStatus(existing.status)) {
      return NextResponse.json(
        { error: "Only completed or aborted runs can be reopened" },
        { status: 409 },
      );
    }
    try {
      const outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(runs)
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
          .limit(1)
          .for("update");
        if (!locked) return { kind: "missing" as const };
        if (!isReopenableRunStatus(locked.status)) {
          return { kind: "not-reopenable" as const, status: locked.status };
        }
        const [updated] = await tx
          .update(runs)
          .set({
            status: "in_progress",
            completedAt: null,
            startedAt: locked.startedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
          .returning();
        return { kind: "ok" as const, run: updated, previousStatus: locked.status };
      });
      if (outcome.kind === "missing") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (outcome.kind === "not-reopenable") {
        return NextResponse.json(
          { error: "Only completed or aborted runs can be reopened" },
          { status: 409 },
        );
      }
      await recordAuditEvent({
        action: "run.reopen",
        actorId: session.user.id,
        actorEmail: session.user.email ?? null,
        workspaceId,
        targetType: "run",
        targetId: id,
        metadata: {
          previousStatus: outcome.previousStatus,
          name: outcome.run.name,
        },
        request,
      });
      liveRun(workspaceId, id, { runStatus: "in_progress" });
      return NextResponse.json({ run: outcome.run });
    } catch (err) {
      if (isLockFailure(err)) {
        return NextResponse.json(
          { error: "Could not lock the run to reopen it. Retry." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Failed to reopen run" },
        { status: 500 },
      );
    }
  }

  if (action === "bulk_results") {
    const parsedBulk = bulkResultsSchema.safeParse(body);
    if (!parsedBulk.success) {
      return NextResponse.json(
        { error: parsedBulk.error.flatten() },
        { status: 400 },
      );
    }
    if (isRunFrozen(existing.status)) {
      return runImmutableResponse(immutableMessageFor(existing.status));
    }

    let assigneeId: string | null | undefined = undefined;
    if (parsedBulk.data.assigneeId !== undefined) {
      const parsedAssignee = parseAssigneeInput(parsedBulk.data.assigneeId);
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
      assigneeId = parsedAssignee.assigneeId;
    }

    const resultIds = [...new Set(parsedBulk.data.resultIds)];
    const status = parsedBulk.data.status;

    try {
      const outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ status: runs.status, startedAt: runs.startedAt, name: runs.name })
          .from(runs)
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
          .limit(1)
          .for("update");
        if (!locked) return { kind: "missing" as const };
        if (isRunFrozen(locked.status)) {
          return { kind: "frozen" as const, status: locked.status };
        }

        const rows = await tx
          .select()
          .from(runResults)
          .where(and(eq(runResults.runId, id), inArray(runResults.id, resultIds)))
          .for("update");
        if (rows.length === 0) {
          return { kind: "result-missing" as const };
        }

        const patch: {
          status?: typeof status;
          assigneeId?: string | null;
          executedById?: string;
          executedAt?: Date;
        } = {};
        if (status !== undefined) {
          patch.status = status;
          patch.executedById = session.user.id;
          patch.executedAt = new Date();
        }
        if (assigneeId !== undefined) {
          patch.assigneeId = assigneeId;
        }

        const updated = await tx
          .update(runResults)
          .set(patch)
          .where(and(eq(runResults.runId, id), inArray(runResults.id, resultIds)))
          .returning();

        await tx
          .update(runs)
          .set({
            status: "in_progress",
            startedAt: locked.startedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)));

        if (assigneeId && assigneeId !== session.user.id) {
          const previousById = new Map(rows.map((row) => [row.id, row.assigneeId]));
          const notifyIds = new Set<string>();
          for (const row of updated) {
            if (
              row.assigneeId === assigneeId &&
              previousById.get(row.id) !== assigneeId
            ) {
              notifyIds.add(row.id);
            }
          }
          if (notifyIds.size > 0) {
            await tx.insert(notifications).values({
              workspaceId,
              userId: assigneeId,
              type: "assignment",
              title: `Tests assigned in ${locked.name}`,
              body: `${notifyIds.size} result${notifyIds.size === 1 ? "" : "s"} assigned to you.`,
              entityType: "run",
              entityId: id,
            });
            return {
              kind: "ok" as const,
              results: updated,
              assignment: {
                userId: assigneeId,
                title: `Tests assigned in ${locked.name}`,
                body: `${notifyIds.size} result${notifyIds.size === 1 ? "" : "s"} assigned to you.`,
              },
            };
          }
        }

        return { kind: "ok" as const, results: updated };
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

      if ("assignment" in outcome && outcome.assignment) {
        void import("@/lib/notification-channels")
          .then(({ dispatchNotificationChannels }) =>
            dispatchNotificationChannels(
              "assignment",
              {
                userId: outcome.assignment!.userId,
                title: outcome.assignment!.title,
                body: outcome.assignment!.body,
                entityType: "run",
                entityId: id,
              },
              workspaceId,
            ),
          )
          .catch(() => {});
      }

      for (const row of outcome.results) {
        if (row.status === "failed" || row.status === "blocked") {
          await openTriageForResult(row.id);
        }
        if (row.status === "passed" && row.caseId) {
          try {
            await syncIssuesOnPassingRetest({
              workspaceId,
              caseId: row.caseId,
            });
          } catch {
            // Outbound close is best-effort.
          }
        }
        liveRun(workspaceId, id, {
          resultId: row.id,
          status: row.status,
          assigneeId: row.assigneeId,
          runStatus: "in_progress",
        });
        if (row.status === "failed" || row.status === "blocked") {
          emitLive({
            workspaceId,
            topic: "triage",
            entityId: row.id,
            resultId: row.id,
            status: row.status,
          });
        }
      }

      return NextResponse.json({ results: outcome.results });
    } catch (err) {
      if (isLockFailure(err)) {
        return NextResponse.json(
          { error: "Could not lock the run for bulk update. Retry." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Failed to update results" },
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
        let assignment: {
          userId: string;
          title: string;
          body: string;
        } | null = null;
        if (updated.assigneeId && updated.assigneeId !== locked.assigneeId && updated.assigneeId !== session.user.id) {
          assignment = {
            userId: updated.assigneeId,
            title: `Run assigned: ${updated.name}`,
            body: "Open the run to continue testing.",
          };
          await tx.insert(notifications).values({
            workspaceId,
            userId: updated.assigneeId,
            type: "assignment",
            title: assignment.title,
            body: assignment.body,
            entityType: "run",
            entityId: id,
          });
        }
        return { kind: "ok" as const, run: updated, assignment };
      });
      if (outcome.kind === "missing") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (outcome.kind === "frozen") {
        return runImmutableResponse(immutableMessageFor(outcome.status));
      }
      if (outcome.assignment) {
        void import("@/lib/notification-channels")
          .then(({ dispatchNotificationChannels }) =>
            dispatchNotificationChannels(
              "assignment",
              {
                userId: outcome.assignment!.userId,
                title: outcome.assignment!.title,
                body: outcome.assignment!.body,
                entityType: "run",
                entityId: id,
              },
              workspaceId,
            ),
          )
          .catch(() => {});
      }
      liveRun(workspaceId, id, { assigneeId: outcome.run.assigneeId });
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
        const [previous] = await tx.select({ assigneeId: runResults.assigneeId }).from(runResults).where(and(eq(runResults.runId, id), eq(runResults.id, resultId.data))).for("update");
        const [updated] = await tx
          .update(runResults)
          .set({ assigneeId: parsedAssignee.assigneeId })
          .where(
            and(eq(runResults.runId, id), eq(runResults.id, resultId.data)),
          )
          .returning();
        if (!updated) return { kind: "result-missing" as const };
        let assignment: {
          userId: string;
          title: string;
          body: string;
          entityId: string;
        } | null = null;
        if (updated.assigneeId && updated.assigneeId !== previous?.assigneeId && updated.assigneeId !== session.user.id) {
          assignment = {
            userId: updated.assigneeId,
            title: `Test assigned in ${existing.name}`,
            body: "Open the result to continue testing.",
            entityId: updated.id,
          };
          await tx.insert(notifications).values({
            workspaceId,
            userId: updated.assigneeId,
            type: "assignment",
            title: assignment.title,
            body: assignment.body,
            entityType: "result",
            entityId: updated.id,
          });
        }
        return { kind: "ok" as const, result: updated, assignment };
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
      if (outcome.assignment) {
        void import("@/lib/notification-channels")
          .then(({ dispatchNotificationChannels }) =>
            dispatchNotificationChannels(
              "assignment",
              {
                userId: outcome.assignment!.userId,
                title: outcome.assignment!.title,
                body: outcome.assignment!.body,
                entityType: "result",
                entityId: outcome.assignment!.entityId,
                runId: id,
              },
              workspaceId,
            ),
          )
          .catch(() => {});
      }
      liveRun(workspaceId, id, {
        resultId: outcome.result.id,
        assigneeId: outcome.result.assigneeId,
      });
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

  const resultWhere = parsed.data.resultId
    ? and(eq(runResults.runId, id), eq(runResults.id, parsed.data.resultId))
    : and(eq(runResults.runId, id), eq(runResults.caseId, parsed.data.caseId));

  let overallStatus = parsed.data.status;
  if (parsed.data.stepResults && parsed.data.stepResults.length > 0) {
    const current = await db.query.runResults.findFirst({
      where: resultWhere,
    });
    if (!current) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }
    for (const step of parsed.data.stepResults) {
      await db
        .update(runStepResults)
        .set({
          status: step.status,
          notes: step.notes ?? "",
        })
        .where(
          and(
            eq(runStepResults.resultId, current.id),
            eq(runStepResults.position, step.position),
          ),
        );
    }
    if (overallStatus === undefined) {
      const rows = await db.query.runStepResults.findMany({
        where: eq(runStepResults.resultId, current.id),
      });
      const { rollupStepStatuses } = await import("@/lib/tcm/steps");
      overallStatus = rollupStepStatuses(rows.map((r) => r.status));
    }
  }

  if (overallStatus === undefined) {
    return NextResponse.json({ error: "Provide a status" }, { status: 400 });
  }

  const durationPatch =
    parsed.data.durationMs === undefined
      ? {}
      : {
          durationMs:
            parsed.data.durationMs == null
              ? null
              : clampDurationMs(parsed.data.durationMs),
        };

  const [updated] = await db
    .update(runResults)
    .set({
      status: overallStatus,
      notes: parsed.data.notes,
      executedById: session.user.id,
      executedAt: new Date(),
      ...durationPatch,
    })
    .where(resultWhere)
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  if (parsed.data.customFields) {
    const { upsertCustomFieldValues } = await import("@/lib/tcm/case-tcm");
    const saved = await upsertCustomFieldValues({
      workspaceId,
      entityType: "result",
      entityId: updated.id,
      values: parsed.data.customFields,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }
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
  if (updated.status === "passed" && updated.caseId) {
    try {
      await syncIssuesOnPassingRetest({
        workspaceId,
        caseId: updated.caseId,
      });
    } catch {
      // Outbound close is best-effort; the result is already recorded.
    }
  }

  liveRun(workspaceId, id, {
    resultId: updated.id,
    status: updated.status,
    runStatus: "in_progress",
  });
  return NextResponse.json({ result: updated });
}
