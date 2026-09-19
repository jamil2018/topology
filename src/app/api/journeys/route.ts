import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { journeys, qualityEdges } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  description: z.string().optional().default(""),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  /** Intent ids linked via `part_of` (intent → journey) and/or `covers`. */
  intentIds: z.array(z.string().uuid()).optional().default([]),
});

async function intentIdsForJourneys(
  workspaceId: string,
  journeyIds: string[],
): Promise<Map<string, string[]>> {
  if (journeyIds.length === 0) return new Map();
  const edges = await db.query.qualityEdges.findMany({
    where: and(
      eq(qualityEdges.workspaceId, workspaceId),
      eq(qualityEdges.fromType, "journey"),
    ),
  });
  const reverse = await db.query.qualityEdges.findMany({
    where: and(
      eq(qualityEdges.workspaceId, workspaceId),
      eq(qualityEdges.toType, "journey"),
    ),
  });

  const map = new Map<string, string[]>();
  for (const id of journeyIds) map.set(id, []);

  for (const e of edges) {
    if (!journeyIds.includes(e.fromId)) continue;
    if (e.toType !== "intent") continue;
    if (e.relation !== "covers" && e.relation !== "part_of") continue;
    const list = map.get(e.fromId) ?? [];
    list.push(e.toId);
    map.set(e.fromId, list);
  }
  for (const e of reverse) {
    if (!journeyIds.includes(e.toId)) continue;
    if (e.fromType !== "intent") continue;
    if (e.relation !== "covers" && e.relation !== "part_of") continue;
    const list = map.get(e.toId) ?? [];
    list.push(e.fromId);
    map.set(e.toId, list);
  }

  for (const [id, list] of map) {
    map.set(id, [...new Set(list)]);
  }
  return map;
}

async function replaceJourneyIntentEdges(
  workspaceId: string,
  journeyId: string,
  intentIds: string[],
) {
  await db
    .delete(qualityEdges)
    .where(
      and(
        eq(qualityEdges.workspaceId, workspaceId),
        eq(qualityEdges.fromType, "journey"),
        eq(qualityEdges.fromId, journeyId),
      ),
    );
  await db
    .delete(qualityEdges)
    .where(
      and(
        eq(qualityEdges.workspaceId, workspaceId),
        eq(qualityEdges.toType, "journey"),
        eq(qualityEdges.toId, journeyId),
        eq(qualityEdges.fromType, "intent"),
      ),
    );

  if (intentIds.length === 0) return;
  await db.insert(qualityEdges).values(
    intentIds.map((intentId) => ({
      workspaceId,
      fromType: "journey" as const,
      fromId: journeyId,
      toType: "intent" as const,
      toId: intentId,
      relation: "part_of" as const,
    })),
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "journeys.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const workspaceId = access.ctx.project.id;
  const rows = await db.query.journeys.findMany({
    where: eq(journeys.workspaceId, workspaceId),
    orderBy: [asc(journeys.key)],
  });
  const intentMap = await intentIdsForJourneys(
    workspaceId,
    rows.map((r) => r.id),
  );

  return NextResponse.json({
    journeys: rows.map((j) => ({
      ...j,
      intentIds: intentMap.get(j.id) ?? [],
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "journeys.create",
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
    const [created] = await db
      .insert(journeys)
      .values({
        workspaceId,
        key: parsed.data.key,
        title: parsed.data.title,
        description: parsed.data.description,
        criticality: parsed.data.criticality,
      })
      .returning();

    if (parsed.data.intentIds.length > 0) {
      await replaceJourneyIntentEdges(
        workspaceId,
        created.id,
        parsed.data.intentIds,
      );
    }

    return NextResponse.json(
      { journey: { ...created, intentIds: parsed.data.intentIds } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Journey key already exists or create failed" },
      { status: 409 },
    );
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(240).optional(),
  description: z.string().optional(),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  intentIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "journeys.edit",
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

  const { id, intentIds, ...rest } = parsed.data;
  const [updated] = await db
    .update(journeys)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(journeys.id, id), eq(journeys.workspaceId, workspaceId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (intentIds) {
    await replaceJourneyIntentEdges(workspaceId, id, intentIds);
  }

  const intentMap = await intentIdsForJourneys(workspaceId, [id]);
  return NextResponse.json({
    journey: { ...updated, intentIds: intentMap.get(id) ?? intentIds ?? [] },
  });
}
