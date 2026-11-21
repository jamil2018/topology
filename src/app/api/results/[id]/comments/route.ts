import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { resultComments, runResults } from "@/db/schema";
import { emitLive } from "@/lib/live";
import { notifyEntityCommentMentions } from "@/lib/notifications";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

function invalidResultId(id: string) {
  return !z.string().uuid().safeParse(id).success;
}

async function loadScopedResult(resultId: string, workspaceId: string) {
  const result = await db.query.runResults.findFirst({
    where: eq(runResults.id, resultId),
    with: { run: true },
  });
  if (!result || result.run?.workspaceId !== workspaceId) return null;
  return result;
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

  const { id: resultId } = await params;
  if (invalidResultId(resultId)) {
    return NextResponse.json({ error: "Invalid result id" }, { status: 400 });
  }
  const result = await loadScopedResult(resultId, access.ctx.project.id);
  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  const comments = await db.query.resultComments.findMany({
    where: eq(resultComments.resultId, resultId),
    with: { user: true },
    orderBy: [asc(resultComments.createdAt)],
  });

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: c.user
        ? { id: c.user.id, name: c.user.name, email: c.user.email }
        : null,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    write: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id: resultId } = await params;
  if (invalidResultId(resultId)) {
    return NextResponse.json({ error: "Invalid result id" }, { status: 400 });
  }
  const result = await loadScopedResult(resultId, access.ctx.project.id);
  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
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

  const [comment] = await db
    .insert(resultComments)
    .values({
      resultId,
      userId: session.user.id,
      body: parsed.data.body,
    })
    .returning();

  const workspaceId = access.ctx.project.id;
  const commentPayload = {
    id: comment.id,
    body: comment.body,
    createdAt:
      comment.createdAt instanceof Date
        ? comment.createdAt.toISOString()
        : String(comment.createdAt),
    user: {
      id: session.user.id,
      name: session.user.name ?? null,
      email: session.user.email ?? "",
    },
  };

  emitLive({
    workspaceId,
    topic: "run",
    entityId: result.runId,
    resultId,
    kind: "comment",
    comment: commentPayload,
  });

  void notifyEntityCommentMentions({
    workspaceId,
    authorUserId: session.user.id,
    entityType: "result",
    entityId: resultId,
    body: parsed.data.body,
  }).catch(() => {});

  return NextResponse.json({ comment: commentPayload }, { status: 201 });
}
