import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, caseVersions } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { restoreCaseVersion } from "@/lib/tcm/case-tcm";
import { diffSnapshots, parseCaseSnapshot } from "@/lib/tcm/versions";

type Params = { params: Promise<{ id: string; versionId: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id, versionId } = await params;
  if (
    !z.string().uuid().safeParse(id).success ||
    !z.string().uuid().safeParse(versionId).success
  ) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const version = await db.query.caseVersions.findFirst({
    where: and(
      eq(caseVersions.id, versionId),
      eq(caseVersions.caseId, id),
      eq(caseVersions.workspaceId, access.ctx.project.id),
    ),
  });
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }
  const current = await db.query.cases.findFirst({
    where: and(eq(cases.id, id), eq(cases.workspaceId, access.ctx.project.id)),
  });
  const snapshot = parseCaseSnapshot(version.snapshotJson);
  const currentSnap = current
    ? parseCaseSnapshot(
        JSON.stringify({
          title: current.title,
          description: current.description,
          preconditions: current.preconditions,
          steps: current.steps,
          expectedResult: current.expectedResult,
          priority: current.priority,
          status: current.status,
          tags: current.tags,
          folderId: current.folderId,
        }),
      )
    : snapshot;
  return NextResponse.json({
    version: {
      id: version.id,
      version: version.version,
      createdAt: version.createdAt,
      snapshot,
      diff: diffSnapshots(snapshot, currentSnap),
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.edit",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id, versionId } = await params;
  if (
    !z.string().uuid().safeParse(id).success ||
    !z.string().uuid().safeParse(versionId).success
  ) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    body = {};
  }
  if (body.action && body.action !== "restore") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const restored = await restoreCaseVersion({
    workspaceId: access.ctx.project.id,
    caseId: id,
    versionId,
    actorId: session.user.id,
  });
  if (!restored.ok) {
    return NextResponse.json(
      { error: restored.error },
      { status: restored.status },
    );
  }
  return NextResponse.json({ restored: true });
}
