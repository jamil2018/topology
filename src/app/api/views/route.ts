import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import {
  caseViewConfigSchema,
  parseCaseViewConfig,
  parseRunViewConfig,
  runViewConfigSchema,
} from "@/lib/saved-views";

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    name: z.string().trim().min(1).max(80),
    entity: z.literal("cases"),
    config: caseViewConfigSchema,
  }),
  z.object({
    name: z.string().trim().min(1).max(80),
    entity: z.literal("runs"),
    config: runViewConfigSchema,
  }),
]);

function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid request";
  const path = first.path.length ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

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
      config:
        row.entity === "cases"
          ? parseCaseViewConfig(row.configJson)
          : parseRunViewConfig(row.configJson),
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
      { error: formatZodError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const [created] = await db
      .insert(savedViews)
      .values({
        workspaceId,
        name: parsed.data.name,
        entity: parsed.data.entity,
        configJson: JSON.stringify(parsed.data.config),
        createdById: session.user.id,
      })
      .returning();

    return NextResponse.json(
      {
        view: {
          id: created.id,
          name: created.name,
          entity: created.entity,
          config: parsed.data.config,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Failed to create saved view", err);
    return NextResponse.json(
      { error: "Failed to save view" },
      { status: 500 },
    );
  }
}
