import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, folders } from "@/db/schema";
import {
  recordCaseActivity,
  recordCaseFieldChanges,
} from "@/lib/case-activity";
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

  const body = await request.json();
  const parsed = createCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
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

    await recordCaseActivity({
      caseId: created.id,
      actorId: session.user.id,
      action: "created",
      summary: `Created case ${created.key}`,
    });

    return NextResponse.json({ case: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create case";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "Case key already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
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

  const updated = [];
  for (const row of existing) {
    const patch: Partial<typeof cases.$inferInsert> = {
      updatedAt: new Date(),
    };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const fields: string[] = [];

    if (status !== undefined && status !== row.status) {
      before.status = row.status;
      after.status = status;
      patch.status = status;
      fields.push("status");
    }
    if (priority !== undefined && priority !== row.priority) {
      before.priority = row.priority;
      after.priority = priority;
      patch.priority = priority;
      fields.push("priority");
    }
    if (folderId !== undefined && folderId !== row.folderId) {
      before.folderId = row.folderId
        ? (folderNameById.get(row.folderId) ?? row.folderId)
        : "unfiled";
      after.folderId = folderId
        ? (folderNameById.get(folderId) ?? folderId)
        : "unfiled";
      patch.folderId = folderId;
      fields.push("folderId");
    }
    if (tags !== undefined) {
      const nextTags =
        tagMode === "add"
          ? Array.from(new Set([...(row.tags ?? []), ...tags]))
          : tags;
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

    if (fields.length === 0) {
      updated.push(row);
      continue;
    }

    const [next] = await db
      .update(cases)
      .set(patch)
      .where(eq(cases.id, row.id))
      .returning();

    await recordCaseFieldChanges({
      caseId: row.id,
      actorId: session.user.id,
      action: "bulk_updated",
      before,
      after,
      fields,
    });

    updated.push(next);
  }

  return NextResponse.json({
    updated: updated.length,
    cases: updated,
  });
}
