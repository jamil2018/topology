import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http-errors";
import { authorizeReleaseRead } from "@/lib/release-auth";
import { compareReleaseSnapshots } from "@/lib/release-quality";

export async function POST(request: Request) {
  const access = await authorizeReleaseRead(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const result = await compareReleaseSnapshots(access.workspaceId, json.body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    comparison: result.comparison,
    ...(result.beforeReleaseId
      ? {
          beforeReleaseId: result.beforeReleaseId,
          afterReleaseId: result.afterReleaseId,
        }
      : {}),
  });
}
