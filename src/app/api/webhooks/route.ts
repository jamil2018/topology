import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { webhookEndpoints } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { dispatchWebhook } from "@/lib/webhooks";

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

  const endpoints = await db.query.webhookEndpoints.findMany({
    where: eq(webhookEndpoints.workspaceId, workspaceId),
    orderBy: [desc(webhookEndpoints.createdAt)],
  });

  return NextResponse.json({
    endpoints,
    envFallback: Boolean(process.env.TOPOLOGY_WEBHOOK_URL?.trim()),
  });
}

const createSchema = z.object({
  url: z.string().url(),
  secret: z.string().optional().default(""),
  events: z
    .string()
    .optional()
    .default("run.completed,issue.created"),
  description: z.string().optional().default(""),
  enabled: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "webhooks.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const body = await request.json();

  if (body?.action === "test") {
    const payload = await dispatchWebhook(
      "run.completed",
      {
        run: {
          id: "00000000-0000-0000-0000-000000000000",
          name: "Webhook test delivery",
          kind: "manual",
          status: "completed",
          source: "test",
          branch: null,
          commitSha: null,
          completedAt: new Date().toISOString(),
        },
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          blocked: 0,
          skipped: 0,
          untested: 0,
        },
        test: true,
      },
      workspaceId,
    );
    return NextResponse.json({ ok: true, payload });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      workspaceId,
      url: parsed.data.url,
      secret: parsed.data.secret,
      events: parsed.data.events,
      description: parsed.data.description,
      enabled: parsed.data.enabled ? 1 : 0,
    })
    .returning();

  return NextResponse.json({ endpoint: row });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url().optional(),
  secret: z.string().optional(),
  events: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "webhooks.manage",
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

  const { id, enabled, ...rest } = parsed.data;
  const [updated] = await db
    .update(webhookEndpoints)
    .set({
      ...rest,
      ...(enabled === undefined ? {} : { enabled: enabled ? 1 : 0 }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ endpoint: updated });
}

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "webhooks.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await db
    .delete(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, parsed.data.id),
        eq(webhookEndpoints.workspaceId, workspaceId),
      ),
    );

  return NextResponse.json({ ok: true });
}
