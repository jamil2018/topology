import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFlakeHints } from "@/lib/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20),
  );
  const hints = await getFlakeHints(limit);
  return NextResponse.json({ flakeHints: hints });
}
