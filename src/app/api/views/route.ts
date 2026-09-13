import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import {
  caseViewConfigSchema,
  runViewConfigSchema,
} from "@/lib/saved-views";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  entity: z.enum(["cases", "runs"]),
  config: z.union([caseViewConfigSchema, runViewConfigSchema]),
});

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

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity");
  const entityParsed = z.enum(["cases", "runs"]).safeParse(entity);

  const rows = await db.query.savedViews.findMany({
    where: entityParsed.success
      ? and(
          eq(savedViews.workspaceId, workspaceId),
          eq(savedViews.entity, entityParsed.data),
          eq(savedViews.createdById, session.user.id),
        )
      : and(
          eq(savedViews.workspaceId, workspaceId),
          eq(savedViews.createdById, session.user.id),
        ),
    orderBy: [desc(savedViews.updatedAt)],
  });

  return NextResponse.json({
    views: rows.map((row) => ({
      id: row.id,
      name: row.name,
      entity: row.entity,
      config: JSON.parse(row.configJson) as unknown,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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
    write: true,
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

  const configCheck =
    parsed.data.entity === "cases"
      ? caseViewConfigSchema.safeParse(parsed.data.config)
      : runViewConfigSchema.safeParse(parsed.data.config);
  if (!configCheck.success) {
    return NextResponse.json(
      { error: configCheck.error.flatten() },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(savedViews)
    .values({
      workspaceId,
      name: parsed.data.name,
      entity: parsed.data.entity,
      configJson: JSON.stringify(configCheck.data),
      createdById: session.user.id,
    })
    .returning();

  return NextResponse.json(
    {
      view: {
        id: created.id,
        name: created.name,
        entity: created.entity,
        config: configCheck.data,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    },
    { status: 201 },
  );
}
