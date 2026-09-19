import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { releaseSnapshots, releases } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import {
  buildWorkspaceReleaseSnapshot,
  parseStoredSnapshot,
} from "@/lib/release-quality";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  gitTag: z.string().max(120).optional().nullable(),
  sha: z.string().max(64).optional().nullable(),
  milestoneId: z.string().uuid().optional().nullable(),
  releasedAt: z.string().datetime().optional().nullable(),
});

export async function GET(request: Request) {
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

  const workspaceId = access.ctx.project.id;
  const rows = await db.query.releases.findMany({
    where: eq(releases.workspaceId, workspaceId),
    orderBy: [desc(releases.releasedAt), desc(releases.createdAt)],
    with: { milestone: true },
  });

  const releaseIds = rows.map((r) => r.id);
  const snapshots =
    releaseIds.length === 0
      ? []
      : await db.query.releaseSnapshots.findMany({
          where: inArray(releaseSnapshots.releaseId, releaseIds),
          orderBy: [desc(releaseSnapshots.createdAt)],
        });

  const latestByRelease = new Map<string, (typeof snapshots)[number]>();
  for (const snap of snapshots) {
    if (!latestByRelease.has(snap.releaseId)) {
      latestByRelease.set(snap.releaseId, snap);
    }
  }

  return NextResponse.json({
    releases: rows.map((r) => {
      const snap = latestByRelease.get(r.id) ?? null;
      return {
        id: r.id,
        name: r.name,
        gitTag: r.gitTag,
        sha: r.sha,
        milestoneId: r.milestoneId,
        milestoneName: r.milestone?.name ?? null,
        releasedAt: r.releasedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        snapshot: snap
          ? {
              id: snap.id,
              createdAt: snap.createdAt,
              payload: parseStoredSnapshot(snap.payloadJson),
            }
          : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "releases.create",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const snapshotPayload = await buildWorkspaceReleaseSnapshot(workspaceId);

    const created = await db.transaction(async (tx) => {
      const [release] = await tx
        .insert(releases)
        .values({
          workspaceId,
          name: parsed.data.name,
          gitTag: parsed.data.gitTag ?? null,
          sha: parsed.data.sha ?? null,
          milestoneId: parsed.data.milestoneId ?? null,
          releasedAt: parsed.data.releasedAt
            ? new Date(parsed.data.releasedAt)
            : new Date(),
        })
        .returning();

      const [snapshot] = await tx
        .insert(releaseSnapshots)
        .values({
          releaseId: release.id,
          payloadJson: JSON.stringify(snapshotPayload),
        })
        .returning();

      return { release, snapshot };
    });

    return NextResponse.json(
      {
        release: created.release,
        snapshot: {
          id: created.snapshot.id,
          createdAt: created.snapshot.createdAt,
          payload: snapshotPayload,
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Release name already exists or create failed" },
      { status: 409 },
    );
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  gitTag: z.string().max(120).optional().nullable(),
  sha: z.string().max(64).optional().nullable(),
  milestoneId: z.string().uuid().optional().nullable(),
  releasedAt: z.string().datetime().optional().nullable(),
});

export async function PATCH(request: Request) {
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
  const workspaceId = access.ctx.project.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, releasedAt, ...rest } = parsed.data;
  const [updated] = await db
    .update(releases)
    .set({
      ...rest,
      ...(releasedAt !== undefined
        ? { releasedAt: releasedAt ? new Date(releasedAt) : null }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(releases.id, id), eq(releases.workspaceId, workspaceId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ release: updated });
}
