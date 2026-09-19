import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import {
  AI_PROVIDERS,
  getWorkspaceAiProviderConfig,
  toPublicAiProviderView,
} from "@/lib/ai-provider";
import { requireProjectAccess } from "@/lib/project";

const putSchema = z.object({
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).nullable().optional(),
  baseUrl: z.string().max(512).nullable().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "settings.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const config = await getWorkspaceAiProviderConfig(access.ctx.project.id);
  return NextResponse.json({
    ...toPublicAiProviderView(config),
    envProvider: process.env.TOPOLOGY_AI_PROVIDER?.trim() || "none",
    workspaceOverride: {
      provider: access.ctx.project.aiProvider ?? null,
      model: access.ctx.project.aiModel ?? null,
      baseUrl: access.ctx.project.aiBaseUrl ?? null,
    },
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "project.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Partial<typeof workspaces.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.provider !== undefined) {
    updates.aiProvider =
      parsed.data.provider === "none" ? null : parsed.data.provider;
  }
  if (parsed.data.model !== undefined) {
    updates.aiModel = parsed.data.model;
  }
  if (parsed.data.baseUrl !== undefined) {
    updates.aiBaseUrl = parsed.data.baseUrl;
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  await db
    .update(workspaces)
    .set(updates)
    .where(eq(workspaces.id, access.ctx.project.id));

  const config = await getWorkspaceAiProviderConfig(access.ctx.project.id);
  return NextResponse.json(toPublicAiProviderView(config));
}
