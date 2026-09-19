import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { releaseSnapshots, releases } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import {
  analyzeReleaseQuality,
  buildWorkspaceReleaseSnapshot,
  parseStoredSnapshot,
} from "@/lib/release-quality";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "releases.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const release = await db.query.releases.findFirst({
    where: and(
      eq(releases.id, id),
      eq(releases.workspaceId, access.ctx.project.id),
    ),
    with: { milestone: true },
  });
  if (!release) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snap = await db.query.releaseSnapshots.findFirst({
    where: eq(releaseSnapshots.releaseId, id),
    orderBy: [desc(releaseSnapshots.createdAt)],
  });

  const quality = await analyzeReleaseQuality(access.ctx.project.id, {
    mode: "workspace",
  });

  return NextResponse.json({
    release: {
      id: release.id,
      name: release.name,
      gitTag: release.gitTag,
      sha: release.sha,
      milestoneId: release.milestoneId,
      milestoneName: release.milestone?.name ?? null,
      releasedAt: release.releasedAt,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
    },
    snapshot: snap
      ? {
          id: snap.id,
          createdAt: snap.createdAt,
          payload: parseStoredSnapshot(snap.payloadJson),
        }
      : null,
    quality: quality.ok ? quality.quality : null,
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "releases.delete",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const [deleted] = await db
    .delete(releases)
    .where(
      and(
        eq(releases.id, id),
        eq(releases.workspaceId, access.ctx.project.id),
      ),
    )
    .returning({ id: releases.id });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

const resnapshotSchema = z.object({
  action: z.literal("resnapshot"),
});

/** Optional: refresh snapshot from current workspace graph. */
export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "releases.edit",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Body must be { action: "resnapshot" }' },
      { status: 400 },
    );
  }

  const release = await db.query.releases.findFirst({
    where: and(
      eq(releases.id, id),
      eq(releases.workspaceId, access.ctx.project.id),
    ),
  });
  if (!release) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = await buildWorkspaceReleaseSnapshot(access.ctx.project.id);
  const [snapshot] = await db
    .insert(releaseSnapshots)
    .values({
      releaseId: id,
      payloadJson: JSON.stringify(payload),
    })
    .returning();

  return NextResponse.json({
    snapshot: {
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      payload,
    },
  });
}
