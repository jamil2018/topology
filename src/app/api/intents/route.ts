import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { folders, testIntents } from "@/db/schema";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import { requireProjectAccess } from "@/lib/project";
import {
  getIntentDetail,
  listIntentsWithMeta,
} from "@/lib/quality-graph";

const createSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  behavior: z.string().optional().default(""),
  /** Canonical structured representation JSON string, or null to clear. */
  representationJson: z.string().nullable().optional(),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  status: z
    .enum(["draft", "ready", "blocked", "deprecated"])
    .optional()
    .default("draft"),
  folderId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "intents.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const key = searchParams.get("key");
  if (id || key) {
    const detail = await getIntentDetail(
      access.ctx.project.id,
      id ?? key!,
    );
    if (!detail) {
      return NextResponse.json({ error: "Intent not found" }, { status: 404 });
    }
    return NextResponse.json({ intent: detail });
  }

  const intents = await listIntentsWithMeta(access.ctx.project.id);
  return NextResponse.json({ intents });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "intents.create",
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

  const parsed = createSchema.safeParse(body);
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
      "intents.edit",
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
      .insert(testIntents)
      .values({
        workspaceId,
        key: parsed.data.key,
        title: parsed.data.title,
        behavior: parsed.data.behavior,
        representationJson: parsed.data.representationJson ?? null,
        criticality: parsed.data.criticality,
        status: parsed.data.status,
        folderId: parsed.data.folderId ?? null,
        assigneeId: parsed.data.assigneeId ?? null,
      })
      .returning();
    return NextResponse.json({ intent: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Intent key already exists or create failed" },
      { status: 409 },
    );
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(240).optional(),
  behavior: z.string().optional(),
  representationJson: z.string().nullable().optional(),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  status: z.enum(["draft", "ready", "blocked", "deprecated"]).optional(),
  folderId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "intents.edit",
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...rest } = parsed.data;
  const [updated] = await db
    .update(testIntents)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(testIntents.id, id), eq(testIntents.workspaceId, workspaceId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ intent: updated });
}
