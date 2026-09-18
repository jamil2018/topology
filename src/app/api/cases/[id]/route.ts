import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, folders, runResults } from "@/db/schema";
import { isLockFailure } from "@/lib/pg-error";
import { recordCaseFieldChanges } from "@/lib/case-activity";
import { buildCasePatch, updateCaseSchema } from "@/lib/case-update";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ id: string }> };

function invalidId(id: string) {
  return !z.string().uuid().safeParse(id).success;
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

  const row = await db.query.cases.findFirst({
    where: and(eq(cases.id, id), eq(cases.workspaceId, access.ctx.project.id)),
    with: { folder: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  return NextResponse.json({
    case: {
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
      folder: row.folder
        ? { id: row.folder.id, name: row.folder.name }
        : null,
      updatedAt: row.updatedAt,
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
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

  const existing = await db.query.cases.findFirst({
    where: and(eq(cases.id, id), eq(cases.workspaceId, workspaceId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
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

  const allFolders = await db.query.folders.findMany({
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
    parsed.data,
    folderNameById,
  );

  if (fields.length === 0) {
    return NextResponse.json({ case: existing, updated: false });
  }

  const [next] = await db
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
              | "ready"
              | "blocked"
              | "deprecated",
          }
        : {}),
      ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      updatedAt: new Date(),
    })
    .where(eq(cases.id, id))
    .returning();

  await recordCaseFieldChanges({
    caseId: id,
    actorId: session.user.id,
    action: "updated",
    before,
    after,
    fields,
  });

  return NextResponse.json({ case: next, updated: true });
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
      const [locked] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(and(eq(cases.id, id), eq(cases.workspaceId, workspaceId)))
        .limit(1)
        .for("update");
      if (!locked) return { kind: "missing" as const };

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
