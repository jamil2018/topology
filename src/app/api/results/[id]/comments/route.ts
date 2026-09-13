import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { resultComments, runResults } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

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
  const result = await loadScopedResult(resultId, access.ctx.project.id);
  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  const parsed = createSchema.safeParse(await request.json());
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

  return NextResponse.json({ comment }, { status: 201 });
}
