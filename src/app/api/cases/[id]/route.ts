import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, customFieldDefs, folders, notifications, proposals, runResults, sharedSteps } from "@/db/schema";
import {
  recordCaseActivity,
  recordCaseFieldChanges,
} from "@/lib/case-activity";
import { validateCaseReviewTransition } from "@/lib/case-review";
import { buildCasePatch, updateCaseSchema, type UpdateCaseInput } from "@/lib/case-update";
import { readCaseRevision } from "@/lib/case-revision";
import { caseReviewRequired, lockCaseReviewPolicy, type CaseReviewTransaction } from "@/lib/case-review-policy";
import { createProposal, notifyProposalCreated } from "@/lib/proposals";
import type { ProposalPayload } from "@topology/domain";
import { isLockFailure } from "@/lib/pg-error";
import { ctxHasAction, requireProjectAccess, type ActiveProjectContext } from "@/lib/project";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import {
  loadCaseTcm,
  replaceCaseParameters,
  replaceCaseSteps,
  snapshotCaseVersion,
  upsertCustomFieldValues,
} from "@/lib/tcm/case-tcm";

type Params = { params: Promise<{ id: string }> };

function invalidId(id: string) {
  return !z.string().uuid().safeParse(id).success;
}

async function maybeDispatchReviewChannel(input: {
  workspaceId: string;
  title: string;
  body: string;
  entityId: string;
}) {
  try {
    const { dispatchNotificationChannels } = await import(
      "@/lib/notification-channels"
    );
    await dispatchNotificationChannels(
      "assignment",
      {
        title: input.title,
        body: input.body,
        entityType: "case",
        entityId: input.entityId,
      },
      input.workspaceId,
    );
  } catch {
    // Channel delivery is best-effort — in-app notification is enough.
  }
}

export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  if (invalidId(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  const { id: workspaceId, requireCaseReview } = access.ctx.project;
  if (!requireCaseReview) return readCaseDetail(db, workspaceId, id, false);
  return db.transaction((tx) => readCaseDetail(tx, workspaceId, id, true), {
    isolationLevel: "repeatable read", accessMode: "read only",
  });
}

async function readCaseDetail(executor: Pick<typeof db, "query">, workspaceId: string, id: string, requireReview: boolean) {
  const row = await executor.query.cases.findFirst({
    where: and(eq(cases.id, id), eq(cases.workspaceId, workspaceId)),
    with: { folder: true, intent: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const tcm = await loadCaseTcm(workspaceId, id, executor);
  const fieldDefs = await executor.query.customFieldDefs.findMany({
    where: and(
      eq(customFieldDefs.workspaceId, workspaceId),
      eq(customFieldDefs.entity, "case"),
    ),
    orderBy: [asc(customFieldDefs.position)],
  });

  return NextResponse.json({
    case: {
      requireCaseReview: requireReview,
      revision: requireReview ? (await readCaseRevision(workspaceId, id, executor))?.revision : undefined,
      id: row.id,
      key: row.key,
      title: row.title,
      description: row.description,
      preconditions: row.preconditions,
      steps: row.steps,
      expectedResult: row.expectedResult,
      priority: row.priority,
      status: row.status,
      tags: row.tags ?? [],
      folderId: row.folderId,
      intentId: row.intentId,
      reviewerId: row.reviewerId,
      reviewedAt: row.reviewedAt,
      intent: row.intent
        ? {
            id: row.intent.id,
            key: row.intent.key,
            title: row.intent.title,
            criticality: row.intent.criticality,
            status: row.intent.status,
          }
        : null,
      folder: row.folder
        ? { id: row.folder.id, name: row.folder.name }
        : null,
      updatedAt: row.updatedAt,
      structuredSteps: tcm.structuredSteps,
      parameters: tcm.parameters,
      datasets: tcm.datasets,
      customFields: tcm.customFields,
      customFieldDefs: fieldDefs.map((d) => ({
        id: d.id,
        key: d.key,
        label: d.label,
        type: d.type,
        options: d.optionsJson ? JSON.parse(d.optionsJson) : [],
        required: d.required,
      })),
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewAccess = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.view",
  });
  if (!viewAccess.ok) {
    return NextResponse.json(
      { error: viewAccess.error },
      { status: viewAccess.status },
    );
  }
  const { id } = await params;
  if (invalidId(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateCaseSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid case update";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const afterCommit: (() => void)[] = [];
  try {
    const response = await db.transaction((tx) =>
      updateCase(tx, viewAccess.ctx, session.user.id, id, parsed.data, afterCommit),
    );
    for (const callback of afterCommit) callback();
    return response;
  } catch (error) {
    if (error instanceof CaseEditError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (isLockFailure(error)) return NextResponse.json({ error: "Could not lock the case. Retry." }, { status: 409 });
    throw error;
  }
}

class CaseEditError extends Error {}

async function updateCase(
  tx: CaseReviewTransaction,
  project: ActiveProjectContext,
  actorId: string,
  id: string,
  input: UpdateCaseInput,
  afterCommit: (() => void)[],
) {
  const workspaceId = project.project.id;
  const requireReview = await lockCaseReviewPolicy(tx, workspaceId);
  const [existing] = await tx.select().from(cases).where(and(
    eq(cases.id, id), eq(cases.workspaceId, workspaceId),
  )).for("update");
  if (!existing) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const reviewCheck = validateCaseReviewTransition({
    from: existing.status,
    to: input.status,
    reviewerId:
      input.reviewerId !== undefined
        ? input.reviewerId
        : existing.reviewerId,
    reviewComment: input.reviewComment,
  });
  if (!reviewCheck.ok) {
    return NextResponse.json({ error: reviewCheck.error }, { status: 400 });
  }
  const transition = reviewCheck.transition;
  const restoring = requireReview && existing.status === "deprecated" && input.status === "ready";

  const reviewOnly =
    (transition.kind === "approve" || transition.kind === "request_changes") &&
    input.title === undefined &&
    input.description === undefined &&
    input.preconditions === undefined &&
    input.steps === undefined &&
    input.expectedResult === undefined &&
    input.priority === undefined &&
    input.folderId === undefined &&
    input.tags === undefined &&
    input.structuredSteps === undefined &&
    input.parameters === undefined &&
    input.datasets === undefined &&
    input.customFields === undefined;

  if (transition.kind === "approve" || transition.kind === "request_changes") {
    if (!ctxHasAction(project, "cases.approve")) {
      return NextResponse.json(
        { error: "Missing permission: cases.approve" },
        { status: 403 },
      );
    }
    if (!reviewOnly && !ctxHasAction(project, "cases.edit")) {
      return NextResponse.json(
        { error: "Missing permission: cases.edit" },
        { status: 403 },
      );
    }
  } else if (!ctxHasAction(project, "cases.edit")) {
    return NextResponse.json(
      { error: "Missing permission: cases.edit" },
      { status: 403 },
    );
  }

  if (requireReview) {
    if (input.status === "ready" && existing.status !== "ready" && transition.kind !== "approve" && !restoring) {
      return NextResponse.json(caseReviewRequired, { status: 409 });
    }
    if (existing.status === "in_review" && !reviewOnly) {
      return NextResponse.json({ error: "Request changes before editing this review.", code: caseReviewRequired.code }, { status: 409 });
    }
    if (reviewOnly && existing.reviewerId !== actorId && (existing.reviewerId || transition.kind === "approve")) {
      return NextResponse.json({ error: "The assigned reviewer must decide this review." }, { status: 403 });
    }
  }

  if (transition.kind === "submit" && input.reviewerId) {
    const assignee = await requireWorkspaceAssignee(
      workspaceId,
      input.reviewerId,
      "cases.approve",
      tx,
    );
    if (!assignee.ok) {
      return NextResponse.json(
        { error: assignee.error },
        { status: assignee.status },
      );
    }
  }

  if (input.folderId) {
    const folder = await tx.query.folders.findFirst({
      where: and(
        eq(folders.id, input.folderId),
        eq(folders.workspaceId, workspaceId),
      ),
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
  }
  const sharedIds = [...new Set(input.structuredSteps?.flatMap((step) => step.sharedStepId ? [step.sharedStepId] : []))];
  if (sharedIds.length) {
    const steps = await tx.select({ id: sharedSteps.id }).from(sharedSteps).where(and(
      eq(sharedSteps.workspaceId, workspaceId), inArray(sharedSteps.id, sharedIds),
    ));
    if (steps.length !== sharedIds.length) return NextResponse.json({ error: "Shared steps unavailable in this project" }, { status: 400 });
  }

  const allFolders = await tx.query.folders.findMany({
    where: eq(folders.workspaceId, workspaceId),
    columns: { id: true, name: true },
  });
  const folderNameById = new Map(allFolders.map((f) => [f.id, f.name]));

  const { patch, before, after, fields } = buildCasePatch(
    {
      title: existing.title,
      description: existing.description,
      preconditions: existing.preconditions,
      steps: existing.steps,
      expectedResult: existing.expectedResult,
      priority: existing.priority,
      status: existing.status,
      folderId: existing.folderId,
      tags: existing.tags ?? [],
    },
    input,
    folderNameById,
  );

  const tcmChanged =
    input.structuredSteps !== undefined ||
    input.parameters !== undefined ||
    input.datasets !== undefined ||
    input.customFields !== undefined;

  const reviewMetaChanged =
    transition.kind === "submit" ||
    transition.kind === "approve" ||
    transition.kind === "request_changes" ||
    input.reviewerId !== undefined;

  const queueReview = restoring || (existing.status === "ready" && (fields.length > 0 || tcmChanged || reviewMetaChanged));
  if (requireReview && (transition.kind === "approve" || queueReview)) {
    const revision = await readCaseRevision(workspaceId, id, tx);
    if (!input.expectedRevision || revision?.revision !== input.expectedRevision) {
      return NextResponse.json({ code: "STALE_CASE_REVISION", error: "Reload the case before submitting or approving this revision." }, { status: 409 });
    }
    if (queueReview) {
      if (!ctxHasAction(project, "proposals.create")) {
        return NextResponse.json({ error: "Missing permission: proposals.create" }, { status: 403 });
      }
      if (input.status && input.status !== "ready" && input.status !== "deprecated") {
        return NextResponse.json({ error: "Keep the case ready or propose archiving it." }, { status: 400 });
      }
      const { expectedRevision, reviewerId, reviewComment, ...changes } = input;
      if (reviewerId !== undefined || reviewComment !== undefined) {
        return NextResponse.json({ error: "Submit case changes without reviewer fields." }, { status: 400 });
      }
      const payload: ProposalPayload = {
        rationale: `Update ${existing.key}`,
        diffs: [{ action: "update", entityType: "case", entityId: id, before: { ...before, revision: expectedRevision }, after: changes }],
      };
      const prior = await tx.query.proposals.findFirst({ where: and(
        eq(proposals.workspaceId, workspaceId), eq(proposals.createdById, actorId),
        eq(proposals.status, "pending"), eq(proposals.payloadJson, JSON.stringify(payload)),
      ) });
      const proposal = prior ?? await createProposal({
        workspaceId, createdById: actorId, actorType: "user", payload,
        inputRefs: [`/cases/${encodeURIComponent(existing.key)}`],
      }, tx);
      if (!prior) afterCommit.push(() => notifyProposalCreated(proposal, 1));
      return NextResponse.json({ proposalId: proposal.id, href: "/proposals" }, { status: 202 });
    }
  }
  if (requireReview && reviewOnly) {
    input = { ...input, reviewerId: undefined };
  }

  if (fields.length === 0 && !tcmChanged && !reviewMetaChanged) {
    return NextResponse.json({ case: existing, updated: false });
  }

  let next = existing;
  if (fields.length > 0 || reviewMetaChanged) {
    const now = new Date();
    const reviewFields: {
      reviewerId?: string | null;
      reviewedAt?: Date | null;
    } = {};

    if (transition.kind === "submit") {
      reviewFields.reviewerId = input.reviewerId ?? null;
      reviewFields.reviewedAt = null;
    } else if (transition.kind === "approve") {
      reviewFields.reviewedAt = now;
      if (input.reviewerId !== undefined) {
        reviewFields.reviewerId = input.reviewerId;
      } else if (!existing.reviewerId) {
        reviewFields.reviewerId = actorId;
      }
    } else if (transition.kind === "request_changes") {
      reviewFields.reviewedAt = now;
    } else if (input.reviewerId !== undefined) {
      reviewFields.reviewerId = input.reviewerId;
    }

    const [updated] = await tx
      .update(cases)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.preconditions !== undefined
          ? { preconditions: patch.preconditions }
          : {}),
        ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
        ...(patch.expectedResult !== undefined
          ? { expectedResult: patch.expectedResult }
          : {}),
        ...(patch.priority !== undefined
          ? { priority: patch.priority as "P0" | "P1" | "P2" | "P3" }
          : {}),
        ...(patch.status !== undefined
          ? {
              status: patch.status as
                | "draft"
                | "in_review"
                | "ready"
                | "blocked"
                | "deprecated",
            }
          : {}),
        ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...reviewFields,
        updatedAt: now,
      })
      .where(eq(cases.id, id))
      .returning();
    next = updated ?? existing;

    if (fields.length > 0) {
      await recordCaseFieldChanges({
        caseId: id,
        actorId,
        action: "updated",
        before,
        after,
        fields,
      }, tx);
    }

    if (transition.kind === "submit") {
      await recordCaseActivity({
        caseId: id,
        actorId,
        action: "submitted_for_review",
        field: "status",
        fromValue: existing.status,
        toValue: "in_review",
        summary: "Submitted for review",
      }, tx);
    } else if (transition.kind === "approve") {
      await recordCaseActivity({
        caseId: id,
        actorId,
        action: "approved",
        field: "status",
        fromValue: existing.status,
        toValue: "ready",
        summary: "Approved review",
        approvedById: actorId,
      }, tx);
    } else if (transition.kind === "request_changes") {
      await recordCaseActivity({
        caseId: id,
        actorId,
        action: "changes_requested",
        field: "status",
        fromValue: existing.status,
        toValue: "draft",
        summary: `Changes requested: ${input.reviewComment?.trim()}`,
      }, tx);
    }
  }

  if (input.structuredSteps) {
    await replaceCaseSteps({
      workspaceId,
      caseId: id,
      steps: input.structuredSteps,
    }, tx);
  }
  if (input.parameters || input.datasets) {
    const currentTcm = await loadCaseTcm(workspaceId, id, tx);
    await replaceCaseParameters({
      caseId: id,
      parameters: input.parameters ?? currentTcm.parameters,
      datasets: input.datasets ?? currentTcm.datasets,
    }, tx);
  }
  if (input.customFields) {
    const savedFields = await upsertCustomFieldValues({
      workspaceId,
      entityType: "case",
      entityId: id,
      values: input.customFields,
    }, tx);
    if (!savedFields.ok) {
      throw new CaseEditError(savedFields.error);
    }
  }

  if (fields.length > 0 || tcmChanged || reviewMetaChanged) {
    await snapshotCaseVersion({
      workspaceId,
      caseId: id,
      actorId,
    }, tx);
  }

  if (transition.kind === "submit" && next.reviewerId) {
    const title = `Review requested: ${next.key}`;
    const body = `${next.title} is waiting for your review.`;
    await tx.insert(notifications).values({
      workspaceId,
      userId: next.reviewerId,
      type: "assignment",
      title,
      body,
      entityType: "case",
      entityId: next.id,
    });
    afterCommit.push(() => void maybeDispatchReviewChannel({
      workspaceId,
      title,
      body,
      entityId: next.id,
    }));
  }

  const tcm = await loadCaseTcm(workspaceId, id, tx);
  return NextResponse.json({
    case: {
      ...next, ...tcm, requireCaseReview: requireReview,
      revision: requireReview ? (await readCaseRevision(workspaceId, id, tx))?.revision : undefined,
    },
    updated: true,
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.delete",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { id } = await params;
  if (invalidId(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  const existing = await db.query.cases.findFirst({
    where: and(eq(cases.id, id), eq(cases.workspaceId, workspaceId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  try {
    const deleted = await db.transaction(async (tx) => {
      const requireReview = await lockCaseReviewPolicy(tx, workspaceId);
      const [locked] = await tx
        .select({ id: cases.id, status: cases.status })
        .from(cases)
        .where(and(eq(cases.id, id), eq(cases.workspaceId, workspaceId)))
        .limit(1)
        .for("update");
      if (!locked) return { kind: "missing" as const };
      if (requireReview && ["ready", "in_review"].includes(locked.status)) {
        return { kind: "review" as const };
      }

      const [referenced] = await tx
        .select({ id: runResults.id })
        .from(runResults)
        .where(eq(runResults.caseId, id))
        .limit(1);
      if (referenced) return { kind: "referenced" as const };

      const [row] = await tx
        .delete(cases)
        .where(and(eq(cases.id, id), eq(cases.workspaceId, workspaceId)))
        .returning();
      return { kind: "deleted" as const, case: row };
    });

    if (deleted.kind === "missing") {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    if (deleted.kind === "review") {
      return NextResponse.json({
        code: caseReviewRequired.code,
        error: "Archive the case through review before deleting it.",
      }, { status: 409 });
    }
    if (deleted.kind === "referenced") {
      return NextResponse.json(
        { error: "Cannot delete a case that has run results" },
        { status: 409 },
      );
    }
    return NextResponse.json({ case: deleted.case });
  } catch (err) {
    if (isLockFailure(err)) {
      return NextResponse.json(
        { error: "Could not lock the case to delete it. Retry." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Failed to delete case" },
      { status: 500 },
    );
  }
}
