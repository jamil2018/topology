import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { listCaseVersions, snapshotCaseVersion } from "@/lib/tcm/case-tcm";
import { diffSnapshots, parseCaseSnapshot } from "@/lib/tcm/versions";

type Params = { params: Promise<{ id: string }> };

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
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }
  const existing = await db.query.cases.findFirst({
    where: and(eq(cases.id, id), eq(cases.workspaceId, access.ctx.project.id)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  const versions = await listCaseVersions(id);
  const parsed = versions.map((v) => ({
    id: v.id,
    version: v.version,
    summary: parseCaseSnapshot(v.snapshotJson).title,
    createdAt: v.createdAt,
    snapshot: parseCaseSnapshot(v.snapshotJson),
  }));
  const diffs =
    parsed.length >= 2
      ? diffSnapshots(parsed[1]!.snapshot, parsed[0]!.snapshot)
      : [];
  return NextResponse.json({
    versions: parsed.map((row) => ({
      id: row.id,
      version: row.version,
      summary: row.summary,
      createdAt: row.createdAt,
    })),
    latestDiff: diffs,
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
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }
  const version = await snapshotCaseVersion({
    workspaceId: access.ctx.project.id,
    caseId: id,
    actorId: session.user.id,
    summary: "Manual snapshot",
  });
  if (!version) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  return NextResponse.json({ version }, { status: 201 });
}
