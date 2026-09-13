import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { folders, milestones } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import {
  getActiveMilestoneReadiness,
  listMilestonesWithReadiness,
} from "@/lib/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const url = new URL(request.url);
  if (url.searchParams.get("active") === "1") {
    const active = await getActiveMilestoneReadiness(workspaceId);
    return NextResponse.json({ milestone: active });
  }

  const items = await listMilestonesWithReadiness(workspaceId);
  return NextResponse.json({ milestones: items });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  passRateThreshold: z.number().int().min(0).max(100).optional(),
  maxOpenP0Failures: z.number().int().min(0).max(100).optional(),
  minExecutedPct: z.number().int().min(0).max(100).optional(),
  maxOpenBlockers: z.number().int().min(0).max(100).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().default(""),
  passRateThreshold: z.number().int().min(0).max(100).optional(),
  maxOpenP0Failures: z.number().int().min(0).max(100).optional(),
  minExecutedPct: z.number().int().min(0).max(100).optional(),
  maxOpenBlockers: z.number().int().min(0).max(100).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    write: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.folderId) {
    const folder = await db.query.folders.findFirst({
      where: and(
        eq(folders.id, parsed.data.folderId),
        eq(folders.workspaceId, workspaceId),
      ),
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
  }

  const [row] = await db
    .insert(milestones)
    .values({
      workspaceId,
      name: parsed.data.name,
      description: parsed.data.description,
      passRateThreshold: parsed.data.passRateThreshold ?? 95,
      maxOpenP0Failures: parsed.data.maxOpenP0Failures ?? 0,
      minExecutedPct: parsed.data.minExecutedPct ?? 80,
      maxOpenBlockers: parsed.data.maxOpenBlockers ?? 0,
      folderId: parsed.data.folderId ?? null,
      status: "active",
    })
    .returning();

  return NextResponse.json({ milestone: row });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    write: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...rest } = parsed.data;

  if (rest.folderId) {
    const folder = await db.query.folders.findFirst({
      where: and(
        eq(folders.id, rest.folderId),
        eq(folders.workspaceId, workspaceId),
      ),
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
  }

  const [updated] = await db
    .update(milestones)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(milestones.id, id), eq(milestones.workspaceId, workspaceId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const items = await listMilestonesWithReadiness(workspaceId);
  const view = items.find((m) => m.milestone.id === id) ?? null;
  return NextResponse.json({ milestone: updated, readiness: view });
}
