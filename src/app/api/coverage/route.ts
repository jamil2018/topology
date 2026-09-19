import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { requireProjectAccess } from "@/lib/project";
import { filterCoverageReport, getWorkspaceCoverage } from "@/lib/quality-graph";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter");

  const session = await auth();
  if (session?.user?.id) {
    const access = await requireProjectAccess(session.user.id, {
      request,
      action: "intents.view",
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const coverage = filterCoverageReport(
      await getWorkspaceCoverage(access.ctx.project.id),
      filter,
    );
    return NextResponse.json({ coverage });
  }

  const token = await authenticateCiRequest(request);
  if (!token.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const coverage = filterCoverageReport(
    await getWorkspaceCoverage(token.workspaceId),
    filter,
  );
  return NextResponse.json({ coverage });
}
