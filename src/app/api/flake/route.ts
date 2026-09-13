import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireProjectAccess } from "@/lib/project";
import { getFlakeHints } from "@/lib/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20),
  );
  const hints = await getFlakeHints(access.ctx.project.id, limit);
  return NextResponse.json({ flakeHints: hints });
}
