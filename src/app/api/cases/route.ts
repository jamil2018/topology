import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, folders } from "@/db/schema";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import {
  recordCaseActivity,
  recordCaseFieldChanges,
} from "@/lib/case-activity";
import { unionTags } from "@/lib/case-update";
import { caseWriteError, isLockFailure } from "@/lib/pg-error";
import { requireProjectAccess } from "@/lib/project";
import { listCases } from "@/lib/queries";

const createCaseSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  description: z.string().optional().default(""),
  preconditions: z.string().optional().default(""),
  steps: z.string().optional().default(""),
  expectedResult: z.string().optional().default(""),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  status: z
    .enum(["draft", "ready", "blocked", "deprecated"])
    .optional()
    .default("draft"),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  assigneeId: z.string().uuid().nullable().optional(),
});

const bulkUpdateSchema = z.object({
  caseIds: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(["draft", "ready", "blocked", "deprecated"]).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  tagMode: z.enum(["replace", "add"]).optional().default("replace"),
});

function buildBulkPatch(
  row: {
    status: string;
    priority: string;
    folderId: string | null;
    tags: string[] | null;
  },
  input: {
    status?: "draft" | "ready" | "blocked" | "deprecated";
    priority?: "P0" | "P1" | "P2" | "P3";
    folderId?: string | null;
    tags?: string[];
    tagMode: "replace" | "add";
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
      input.tagMode === "add" ? unionTags(row.tags, input.tags) : input.tags;
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
  if (folderId !== null && !z.string().uuid().safeParse(folderId).success) {
    return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  }
  const data = await listCases(workspaceId, folderId);
  return NextResponse.json({ cases: data });
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

  try {
    const [created] = await db
      .insert(cases)
      .values({
        ...parsed.data,
        workspaceId,
        createdById: session.user.id,
      })
      .returning();

    const { ensureIntentForCase } = await import("@/lib/quality-graph");
    const { intentId } = await ensureIntentForCase(created);
    const withIntent = { ...created, intentId };

    await recordCaseActivity({
      caseId: created.id,
      actorId: session.user.id,
      action: "created",
      summary: `Created case ${created.key}`,
    });

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

  const existing = await db.query.cases.findMany({
    where: and(
      inArray(cases.id, caseIds),
      eq(cases.workspaceId, workspaceId),
    ),
  });
  if (existing.length === 0) {
    return NextResponse.json({ error: "No matching cases" }, { status: 404 });
  }

  const folderNameById = new Map<string, string>();
  const allFolders = await db.query.folders.findMany({
    where: eq(folders.workspaceId, workspaceId),
  });
  for (const f of allFolders) folderNameById.set(f.id, f.name);

  const input = { status, priority, folderId, tags, tagMode };
  const updated = [];

  const record = async (
    rowId: string,
    built: ReturnType<typeof buildBulkPatch>,
  ) => {
    if (built.fields.length === 0) return;
    await recordCaseFieldChanges({
      caseId: rowId,
      actorId: session.user.id,
      action: "bulk_updated",
      before: built.before,
      after: built.after,
      fields: built.fields,
    });
  };

  // Add-mode unions tags under a row lock so concurrent adds cannot drop a tag.
  // Replace mode still overwrites the array (last write wins).
  if (tags !== undefined && tagMode === "add") {
    try {
      const written = await db.transaction(async (tx) => {
        const locked = await tx
          .select()
          .from(cases)
          .where(
            and(
              inArray(
                cases.id,
                existing.map((row) => row.id),
              ),
              eq(cases.workspaceId, workspaceId),
            ),
          )
          .orderBy(cases.id)
          .for("update");

        const rows = [];
        for (const row of locked) {
          const built = buildBulkPatch(row, input, folderNameById);
          if (built.fields.length === 0) {
            rows.push({ next: row, built });
            continue;
          }
          const [next] = await tx
            .update(cases)
            .set({ ...built.patch, updatedAt: new Date() })
            .where(eq(cases.id, row.id))
            .returning();
          rows.push({ next, built });
        }
        return rows;
      });

      for (const item of written) {
        if (!item.next) continue;
        await record(item.next.id, item.built);
        updated.push(item.next);
      }
    } catch (err) {
      if (isLockFailure(err)) {
        return NextResponse.json(
          { error: "Could not lock cases to update tags. Retry." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Failed to update cases" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      updated: updated.length,
      cases: updated,
    });
  }

  for (const row of existing) {
    const built = buildBulkPatch(row, input, folderNameById);
    if (built.fields.length === 0) {
      updated.push(row);
      continue;
    }

    const [next] = await db
      .update(cases)
      .set({ ...built.patch, updatedAt: new Date() })
      .where(eq(cases.id, row.id))
      .returning();

    await record(row.id, built);
    updated.push(next);
  }

  return NextResponse.json({
    updated: updated.length,
    cases: updated,
  });
}
