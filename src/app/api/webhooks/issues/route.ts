import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inboundIssueSigningStatus } from "@/lib/issue-inbound-webhooks";
import { requireProjectAccess } from "@/lib/project";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  return NextResponse.json({
    workspaceId: access.ctx.project.id,
    providers: inboundIssueSigningStatus(),
  });
}
