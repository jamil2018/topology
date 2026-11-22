import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonBody } from "@/lib/http-errors";
import { requireProjectAccess } from "@/lib/project";
import { createExploratorySession, exploratorySessionSchema } from "@/lib/tcm/exploratory-session";

export async function POST(request: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(userId, { request, action: "runs.create" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = exploratorySessionSchema.safeParse(body.body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a name, charter, and valid environment" }, { status: 400 });
  const session = await createExploratorySession({ ...parsed.data, workspaceId: access.ctx.project.id, actorId: userId });
  return NextResponse.json(session, { status: 201 });
}
