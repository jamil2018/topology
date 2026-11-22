import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { readJsonBody } from "@/lib/http-errors";
import { EvidenceChangedError, readPrReleaseEvidence, signPrReleaseEvidence } from "@/lib/pr-release-evidence";
import { requireProjectAccess } from "@/lib/project";
import { authorizeReleaseRead } from "@/lib/release-auth";
import { isUuid } from "@/lib/queries/ids";

export async function GET(request: Request) {
  const access = await authorizeReleaseRead(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const prId = new URL(request.url).searchParams.get("pullRequestId") ?? "";
  if (!isUuid(prId)) return NextResponse.json({ error: "Invalid pull request id" }, { status: 400 });
  const report = await readPrReleaseEvidence(access.workspaceId, prId);
  if (!report) return NextResponse.json({ error: "Pull request not found" }, { status: 404 });
  return NextResponse.json({ report });
}

const signoffSchema = z.object({ pullRequestId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, action: "releases.edit" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = signoffSchema.safeParse(json.body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid sign-off input" }, { status: 400 });

  try {
    const signoff = await signPrReleaseEvidence({
      ...parsed.data, workspaceId: access.ctx.project.id, actorId: session.user.id,
    });
    if (!signoff) return NextResponse.json({ error: "Pull request not found" }, { status: 404 });
    return NextResponse.json({ signoff });
  } catch (error) {
    if (!(error instanceof EvidenceChangedError)) throw error;
    return NextResponse.json({ error: error.message, code: "EVIDENCE_CHANGED" }, { status: 409 });
  }
}
