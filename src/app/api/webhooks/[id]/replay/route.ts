import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { readJsonBody } from "@/lib/http-errors";
import { requireProjectAccess } from "@/lib/project";
import { replayWebhookDelivery } from "@/lib/webhooks";

type Params = { params: Promise<{ id: string }> };

const replaySchema = z.object({
  deliveryId: z.string().uuid(),
});

export async function POST(request: Request, { params }: Params) {
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

  const { id: endpointId } = await params;
  if (!z.string().uuid().safeParse(endpointId).success) {
    return NextResponse.json({ error: "Invalid webhook id" }, { status: 400 });
  }

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = replaySchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const endpoint = await db.query.webhookEndpoints.findFirst({
    where: and(
      eq(webhookEndpoints.id, endpointId),
      eq(webhookEndpoints.workspaceId, workspaceId),
    ),
  });
  if (!endpoint) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const source = await db.query.webhookDeliveries.findFirst({
    where: and(
      eq(webhookDeliveries.id, parsed.data.deliveryId),
      eq(webhookDeliveries.endpointId, endpointId),
      eq(webhookDeliveries.workspaceId, workspaceId),
    ),
  });
  if (!source) {
    return NextResponse.json(
      { error: "Delivery not found" },
      { status: 404 },
    );
  }

  const result = await replayWebhookDelivery(
    {
      id: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      workspaceId: endpoint.workspaceId,
    },
    { requestBody: source.requestBody, event: source.event },
  );

  await recordAuditEvent({
    action: "webhook.replay",
    actorId: session.user.id,
    actorEmail: session.user.email,
    workspaceId,
    targetType: "webhook_endpoint",
    targetId: endpoint.id,
    request,
    metadata: {
      sourceDeliveryRowId: source.id,
      sourceDeliveryId: source.deliveryId,
      newDeliveryId: result.deliveryId,
      status: result.status,
      ok: result.ok,
    },
  });

  return NextResponse.json({
    ok: result.ok,
    status: result.status,
    deliveryId: result.deliveryId,
    attemptCount: result.attemptCount,
    durationMs: result.durationMs,
  });
}
