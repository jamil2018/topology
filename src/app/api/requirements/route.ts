import { NextResponse } from "next/server";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { qualityEdges, requirements, testIntents } from "@/db/schema";
import { getJiraRequirementSource, lockRequirement } from "@/lib/jira-requirements";
import { listProjectRequirements } from "@/lib/project-requirements";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  description: z.string().optional().default(""),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  /** Optional intent ids to link with relation `covers`. */
  coversIntentIds: z.array(z.string().uuid()).optional().default([]),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "requirements.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  return NextResponse.json({ requirements: await listProjectRequirements(access.ctx.project.id) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "requirements.create",
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
    return await db.transaction(async (tx) => {
      const intentIds = [...new Set(parsed.data.coversIntentIds)];
      if (intentIds.length) {
        const found = await tx.select({ id: testIntents.id }).from(testIntents).where(and(
          eq(testIntents.workspaceId, workspaceId), inArray(testIntents.id, intentIds),
        ));
        if (found.length !== intentIds.length) {
          return NextResponse.json({ error: "Coverage intent not found in this project" }, { status: 400 });
        }
      }

      const [created] = await tx.insert(requirements).values({
        workspaceId, key: parsed.data.key, title: parsed.data.title,
        description: parsed.data.description, criticality: parsed.data.criticality,
      }).returning();
      if (intentIds.length) await tx.insert(qualityEdges).values(intentIds.map((intentId) => ({
        workspaceId, fromType: "requirement" as const, fromId: created.id,
        toType: "intent" as const, toId: intentId, relation: "covers" as const,
      })));
      return NextResponse.json({ requirement: created }, { status: 201 });
    });
  } catch {
    return NextResponse.json({ error: "Requirement key already exists or create failed" }, { status: 409 });
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(240).optional(),
  description: z.string().optional(),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  coversIntentIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "requirements.edit",
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

  const { id, coversIntentIds, ...patch } = parsed.data;
  return db.transaction(async (tx) => {
    const current = await lockRequirement(tx, workspaceId, id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((patch.title !== undefined || patch.description !== undefined) && await getJiraRequirementSource(tx, workspaceId, id)) {
      return NextResponse.json({ error: "Update the title or description in Jira" }, { status: 409 });
    }

    const intentIds = coversIntentIds && [...new Set(coversIntentIds)];
    if (intentIds?.length) {
      const found = await tx.select({ id: testIntents.id }).from(testIntents).where(and(
        eq(testIntents.workspaceId, workspaceId), inArray(testIntents.id, intentIds),
      ));
      if (found.length !== intentIds.length) {
        return NextResponse.json({ error: "Coverage intent not found in this project" }, { status: 400 });
      }
    }

    const [updated] = await tx.update(requirements).set({ ...patch, updatedAt: new Date() })
      .where(and(eq(requirements.id, id), eq(requirements.workspaceId, workspaceId))).returning();

    if (intentIds) {
      await tx.delete(qualityEdges).where(and(
        eq(qualityEdges.workspaceId, workspaceId), eq(qualityEdges.fromType, "requirement"),
        eq(qualityEdges.fromId, id), eq(qualityEdges.toType, "intent"), eq(qualityEdges.relation, "covers"),
        intentIds.length ? notInArray(qualityEdges.toId, intentIds) : undefined,
      ));
      if (intentIds.length) await tx.insert(qualityEdges).values(intentIds.map((intentId) => ({
        workspaceId, fromType: "requirement" as const, fromId: id, toType: "intent" as const, toId: intentId,
        relation: "covers" as const,
      }))).onConflictDoNothing();
    }

    return NextResponse.json({ requirement: updated });
  });
}
