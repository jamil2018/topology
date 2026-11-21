import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
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

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid webhook id" }, { status: 400 });
  }

  const endpoint = await db.query.webhookEndpoints.findFirst({
    where: and(
      eq(webhookEndpoints.id, id),
      eq(webhookEndpoints.workspaceId, workspaceId),
    ),
    columns: { id: true },
  });
  if (!endpoint) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100)
    : 50;

  const deliveries = await db.query.webhookDeliveries.findMany({
    where: and(
      eq(webhookDeliveries.endpointId, id),
      eq(webhookDeliveries.workspaceId, workspaceId),
    ),
    orderBy: [desc(webhookDeliveries.deliveredAt)],
    limit,
  });

  return NextResponse.json({ deliveries });
}
