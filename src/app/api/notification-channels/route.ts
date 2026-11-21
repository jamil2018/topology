import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { notificationChannels } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { readJsonBody } from "@/lib/http-errors";
import {
  isEnvSmtpConfigured,
  mergeChannelConfigJson,
  NOTIFICATION_CHANNEL_EVENTS,
  publicNotificationChannel,
  sendNotificationChannelTest,
  validateChannelConfig,
  type NotificationChannelKind,
} from "@/lib/notification-channels";
import { requireProjectAccess } from "@/lib/project";

const kindSchema = z.enum(["slack", "teams", "smtp"]);
function isValidEventsCsv(raw: string) {
  const parts = raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  return (
    parts.length > 0 &&
    parts.every((e) =>
      (NOTIFICATION_CHANNEL_EVENTS as readonly string[]).includes(e),
    )
  );
}

const eventsSchema = z
  .string()
  .refine(isValidEventsCsv, {
    message: "events must be a non-empty CSV of supported channel events",
  });

const configSchema = z.record(z.string(), z.unknown());

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

  const channels = await db.query.notificationChannels.findMany({
    where: eq(notificationChannels.workspaceId, workspaceId),
    orderBy: [desc(notificationChannels.createdAt)],
  });

  return NextResponse.json({
    channels: channels.map(publicNotificationChannel),
    envSmtpConfigured: isEnvSmtpConfigured(),
  });
}

const createSchema = z.object({
  kind: kindSchema,
  name: z.string().trim().min(1).max(120),
  config: configSchema.optional().default({}),
  events: eventsSchema.optional().default(
    "assignment,mention,run.completed,coverage.dropped",
  ),
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

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const body = json.body as { action?: unknown; id?: unknown } | null;

  if (body?.action === "test") {
    const idParse = z.string().uuid().safeParse(body.id);
    if (!idParse.success) {
      return NextResponse.json({ error: "Channel id required" }, { status: 400 });
    }
    const channel = await db.query.notificationChannels.findFirst({
      where: and(
        eq(notificationChannels.id, idParse.data),
        eq(notificationChannels.workspaceId, workspaceId),
      ),
    });
    if (!channel) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = await sendNotificationChannelTest(channel);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Test delivery failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const configError = validateChannelConfig(
    parsed.data.kind,
    parsed.data.config,
  );
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 400 });
  }

  const [row] = await db
    .insert(notificationChannels)
    .values({
      workspaceId,
      kind: parsed.data.kind,
      name: parsed.data.name,
      configJson: JSON.stringify(parsed.data.config),
      events: parsed.data.events,
      enabled: parsed.data.enabled ? 1 : 0,
    })
    .returning();

  await recordAuditEvent({
    action: "notification_channel.create",
    actorId: session.user.id,
    actorEmail: session.user.email,
    workspaceId,
    targetType: "notification_channel",
    targetId: row.id,
    request,
    metadata: { kind: row.kind, events: row.events, name: row.name },
  });

  return NextResponse.json({ channel: publicNotificationChannel(row) });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  config: configSchema.optional(),
  events: eventsSchema.optional(),
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

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = patchSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await db.query.notificationChannels.findFirst({
    where: and(
      eq(notificationChannels.id, parsed.data.id),
      eq(notificationChannels.workspaceId, workspaceId),
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let nextConfigJson = existing.configJson;
  if (parsed.data.config) {
    nextConfigJson = mergeChannelConfigJson(
      existing.kind as NotificationChannelKind,
      existing.configJson,
      parsed.data.config,
    );
    const configError = validateChannelConfig(
      existing.kind as NotificationChannelKind,
      JSON.parse(nextConfigJson) as Record<string, unknown>,
    );
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 400 });
    }
  }

  const [updated] = await db
    .update(notificationChannels)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.events !== undefined ? { events: parsed.data.events } : {}),
      ...(parsed.data.enabled === undefined
        ? {}
        : { enabled: parsed.data.enabled ? 1 : 0 }),
      configJson: nextConfigJson,
    })
    .where(
      and(
        eq(notificationChannels.id, parsed.data.id),
        eq(notificationChannels.workspaceId, workspaceId),
      ),
    )
    .returning();

  await recordAuditEvent({
    action: "notification_channel.update",
    actorId: session.user.id,
    actorEmail: session.user.email,
    workspaceId,
    targetType: "notification_channel",
    targetId: updated.id,
    request,
  });

  return NextResponse.json({ channel: publicNotificationChannel(updated) });
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

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = deleteSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await db
    .delete(notificationChannels)
    .where(
      and(
        eq(notificationChannels.id, parsed.data.id),
        eq(notificationChannels.workspaceId, workspaceId),
      ),
    );

  await recordAuditEvent({
    action: "notification_channel.delete",
    actorId: session.user.id,
    actorEmail: session.user.email,
    workspaceId,
    targetType: "notification_channel",
    targetId: parsed.data.id,
    request,
  });

  return NextResponse.json({ ok: true });
}
