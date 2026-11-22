import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { requireProjectAccess } from "@/lib/project";
import { createRetestRun, prepareRetest } from "@/lib/retest";
const idsSchema = z.array(z.string().uuid()).min(1).max(500);
const schema = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(20000).default(""), environment: z.string().trim().min(1).max(200).default("local"), sourceResultIds: idsSchema });
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, action: "runs.create" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = idsSchema.safeParse(new URL(request.url).searchParams.get("results")?.split(","));
  if (!parsed.success) return NextResponse.json({ error: "Select source results" }, { status: 400 });
  const draft = await prepareRetest(access.ctx.project.id, parsed.data);
  return draft ? NextResponse.json(draft) : NextResponse.json({ error: "Source results unavailable" }, { status: 404 });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, action: "runs.create" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const userId = session.user.id;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a name and selected source results" }, { status: 400 });
  const run = await db.transaction((tx) => createRetestRun({
    ...parsed.data, workspaceId: access.ctx.project.id, actorId: userId,
  }, tx), { isolationLevel: "repeatable read" });
  if (!run) return NextResponse.json({ error: "Some source results are no longer eligible. Refresh the retest draft." }, { status: 409 });
  return NextResponse.json({ run }, { status: 201 });
}
