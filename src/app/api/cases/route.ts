import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, folders, sharedSteps } from "@/db/schema";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import {
  recordCaseFieldChanges,
} from "@/lib/case-activity";
import {
  subtractTags,
  unionTags,
} from "@/lib/case-update";
import { caseWriteError, isLockFailure } from "@/lib/pg-error";
import { requireProjectAccess } from "@/lib/project";
import { caseListQueryFromSearchParams } from "@/lib/case-list";
import { listCasesPage } from "@/lib/queries";
import { createCaseSchema, persistCase } from "@/lib/case-create";
import { caseReviewRequired, lockCaseReviewPolicy } from "@/lib/case-review-policy";

const bulkUpdateSchema = z.object({
  caseIds: z.array(z.string().uuid()).min(1).max(500),
  status: z
    .enum(["draft", "in_review", "ready", "blocked", "deprecated"])
    .optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  tagMode: z.enum(["replace", "add", "remove"]).optional().default("replace"),
});

function buildBulkPatch(
  row: {
    status: string;
    priority: string;
    folderId: string | null;
    tags: string[] | null;
  },
  input: {
    status?: "draft" | "in_review" | "ready" | "blocked" | "deprecated";
    priority?: "P0" | "P1" | "P2" | "P3";
    folderId?: string | null;
    tags?: string[];
    tagMode: "replace" | "add" | "remove";
  },
  folderNameById: Map<string, string>,
) {
  const patch: Partial<typeof cases.$inferInsert> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const fields: string[] = [];

  if (input.status !== undefined && input.status !== row.status) {
    before.status = row.status;
    after.status = input.status;
    patch.status = input.status;
    fields.push("status");
  }
  if (input.priority !== undefined && input.priority !== row.priority) {
    before.priority = row.priority;
    after.priority = input.priority;
    patch.priority = input.priority;
    fields.push("priority");
  }
  if (input.folderId !== undefined && input.folderId !== row.folderId) {
    before.folderId = row.folderId
      ? (folderNameById.get(row.folderId) ?? row.folderId)
      : "unfiled";
    after.folderId = input.folderId
      ? (folderNameById.get(input.folderId) ?? input.folderId)
      : "unfiled";
    patch.folderId = input.folderId;
    fields.push("folderId");
  }
  if (input.tags !== undefined) {
    const nextTags =
      input.tagMode === "add"
        ? unionTags(row.tags, input.tags)
        : input.tagMode === "remove"
          ? subtractTags(row.tags, input.tags)
          : input.tags;
    const same =
      JSON.stringify([...(row.tags ?? [])].sort()) ===
      JSON.stringify([...nextTags].sort());
    if (!same) {
      before.tags = row.tags ?? [];
      after.tags = nextTags;
      patch.tags = nextTags;
      fields.push("tags");
    }
  }

  return { patch, before, after, fields };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");
  if (
    folderId !== null &&
    folderId !== "all" &&
    folderId !== "unfiled" &&
    !z.string().uuid().safeParse(folderId).success
  ) {
    return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  }
  const query = caseListQueryFromSearchParams(searchParams);
  if (searchParams.get("all") === "1") query.all = true;
  const page = await listCasesPage(workspaceId, query);
  return NextResponse.json({
    cases: page.items,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.create",
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

  const parsed = createCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.assigneeId) {
    const assignee = await requireWorkspaceAssignee(
      workspaceId,
      parsed.data.assigneeId,
      "cases.edit",
    );
    if (!assignee.ok) {
      return NextResponse.json(
        { error: assignee.error },
        { status: assignee.status },
      );
    }
  }

  if (parsed.data.folderId) {
    const folder = await db.query.folders.findFirst({
      where: and(
        eq(folders.id, parsed.data.folderId),
        eq(folders.workspaceId, workspaceId),
      ),
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
  }

  const sharedIds = [...new Set((parsed.data.structuredSteps ?? []).map((step) => step.sharedStepId).filter((id): id is string => Boolean(id)))];
  if (sharedIds.length) {
    const available = await db.select({ id: sharedSteps.id }).from(sharedSteps).where(and(eq(sharedSteps.workspaceId, workspaceId), inArray(sharedSteps.id, sharedIds)));
    if (available.length !== sharedIds.length) return NextResponse.json({ error: "Shared steps unavailable in this project" }, { status: 400 });
  }
  try {
    const withIntent = await db.transaction(async (tx) => {
      if (await lockCaseReviewPolicy(tx, workspaceId) && ["ready", "in_review"].includes(parsed.data.status)) return null;
      return persistCase(tx, workspaceId, session.user.id, parsed.data);
    });
    if (!withIntent) return NextResponse.json(caseReviewRequired, { status: 409 });
    return NextResponse.json({ case: withIntent }, { status: 201 });
  } catch (err) {
    const mapped = caseWriteError(err);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json(
      { error: "Failed to create case" },
      { status: 500 },
    );
  }
}

/** Bulk edit status / priority / folder / tags. */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.edit",
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

  const parsed = bulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { caseIds, status, priority, folderId, tags, tagMode } = parsed.data;
  if (
    status === undefined &&
    priority === undefined &&
    folderId === undefined &&
    tags === undefined
  ) {
    return NextResponse.json(
      { error: "Provide status, priority, folderId, and/or tags" },
      { status: 400 },
    );
  }

  if (folderId) {
    const folder = await db.query.folders.findFirst({
      where: and(
        eq(folders.id, folderId),
        eq(folders.workspaceId, workspaceId),
      ),
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const requireReview = await lockCaseReviewPolicy(tx, workspaceId);
      const existing = await tx.select().from(cases).where(and(
        inArray(cases.id, caseIds), eq(cases.workspaceId, workspaceId),
      )).orderBy(cases.id).for("update");
      if (existing.length === 0) {
        return NextResponse.json({ error: "No matching cases" }, { status: 404 });
      }

      const allFolders = await tx.query.folders.findMany({ where: eq(folders.workspaceId, workspaceId) });
      const folderNameById = new Map(allFolders.map((folder) => [folder.id, folder.name]));
      const input = { status, priority, folderId, tags, tagMode };
      const patches = existing.map((row) => ({ row, change: buildBulkPatch(row, input, folderNameById) }));
      if (requireReview && patches.some(({ row, change }) => change.fields.length > 0 &&
        (["ready", "in_review"].includes(row.status) || status === "ready" || status === "in_review"))) {
        return NextResponse.json({
          code: caseReviewRequired.code,
          error: "Open these cases individually to submit changes for review.",
        }, { status: 409 });
      }

      const updated = [];
      for (const { row, change } of patches) {
        if (change.fields.length === 0) {
          updated.push(row);
          continue;
        }
        const [next] = await tx.update(cases)
          .set({ ...change.patch, updatedAt: new Date() }).where(eq(cases.id, row.id)).returning();
        await recordCaseFieldChanges({
          caseId: row.id, actorId: session.user.id, action: "bulk_updated",
          before: change.before, after: change.after, fields: change.fields,
        }, tx);
        updated.push(next);
      }
      return NextResponse.json({ updated: updated.length, cases: updated });
    });
  } catch (err) {
    if (isLockFailure(err)) {
      return NextResponse.json({ error: "Could not lock cases for the bulk update. Retry." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update cases" }, { status: 500 });
  }
}
