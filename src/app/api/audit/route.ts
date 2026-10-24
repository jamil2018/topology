import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAuditEvents } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/project";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "project.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const events = await listAuditEvents({
    workspaceId: access.ctx.project.id,
    limit: Number.isFinite(limitRaw) ? limitRaw : 100,
  });

  return NextResponse.json({ events });
}
