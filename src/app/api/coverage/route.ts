import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireProjectAccess } from "@/lib/project";
import { getWorkspaceCoverage } from "@/lib/quality-graph";

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

  const coverage = await getWorkspaceCoverage(access.ctx.project.id);
  return NextResponse.json({ coverage });
}
