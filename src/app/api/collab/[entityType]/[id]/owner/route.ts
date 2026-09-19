import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import {
  entityExistsInWorkspace,
  getEntityOwner,
  isCollabEntityType,
  setEntityOwner,
} from "@/lib/entity-collab";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ entityType: string; id: string }> };

const putSchema = z.object({
  userId: z.string().uuid().nullable(),
});

export async function GET(request: Request, { params }: Params) {
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

  const { entityType: rawType, id: entityId } = await params;
  if (!isCollabEntityType(rawType)) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(entityId).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const exists = await entityExistsInWorkspace(
    access.ctx.project.id,
    rawType,
    entityId,
  );
  if (!exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const owner = await getEntityOwner(
    access.ctx.project.id,
    rawType,
    entityId,
  );
  return NextResponse.json({ owner });
}

export async function PUT(request: Request, { params }: Params) {
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

  const { entityType: rawType, id: entityId } = await params;
  if (!isCollabEntityType(rawType)) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(entityId).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const exists = await entityExistsInWorkspace(workspaceId, rawType, entityId);
  if (!exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.userId) {
    const assignee = await requireWorkspaceAssignee(
      workspaceId,
      parsed.data.userId,
      "intents.edit",
    );
    if (!assignee.ok) {
      return NextResponse.json(
        { error: assignee.error },
        { status: assignee.status },
      );
    }
  }

  const owner = await setEntityOwner({
    workspaceId,
    entityType: rawType,
    entityId,
    userId: parsed.data.userId,
  });
  return NextResponse.json({ owner });
}
