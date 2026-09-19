import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createEntityComment,
  entityExistsInWorkspace,
  isCollabEntityType,
  listEntityComments,
} from "@/lib/entity-collab";
import { notifyEntityCommentMentions } from "@/lib/notifications";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ entityType: string; id: string }> };

const createSchema = z.object({
  body: z.string().trim().min(1).max(4000),
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

  const comments = await listEntityComments(
    access.ctx.project.id,
    rawType,
    entityId,
  );
  return NextResponse.json({ comments });
}

export async function POST(request: Request, { params }: Params) {
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

  const comment = await createEntityComment({
    workspaceId: access.ctx.project.id,
    entityType: rawType,
    entityId,
    userId: session.user.id,
    body: parsed.data.body,
  });

  void notifyEntityCommentMentions({
    workspaceId: access.ctx.project.id,
    authorUserId: session.user.id,
    entityType: rawType,
    entityId,
    body: parsed.data.body,
  }).catch(() => {});

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        user: {
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? "",
        },
      },
    },
    { status: 201 },
  );
}
