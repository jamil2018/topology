import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { ensureRepository } from "@/lib/git-sync";
import { readJsonBody } from "@/lib/http-errors";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  remoteUrl: z.string().min(1).max(2048),
  provider: z.enum(["github", "gitlab", "other"]).optional().default("github"),
  defaultBranch: z.string().min(1).max(200).optional().default("main"),
  webhookSecret: z.string().max(512).optional(),
});

function publicRepository(row: typeof repositories.$inferSelect) {
  const { webhookSecret, ...rest } = row;
  return {
    ...rest,
    hasWebhookSecret: Boolean(webhookSecret?.trim()),
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "automation.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await db.query.repositories.findMany({
    where: eq(repositories.workspaceId, access.ctx.project.id),
    orderBy: [asc(repositories.remoteUrl)],
  });
  return NextResponse.json({
    repositories: rows.map(publicRepository),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "automation.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = createSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const repository = await ensureRepository(access.ctx.project.id, {
      remoteUrl: parsed.data.remoteUrl,
      provider: parsed.data.provider,
      defaultBranch: parsed.data.defaultBranch,
    });
    let saved = repository;
    if (parsed.data.webhookSecret?.trim()) {
      const [updated] = await db
        .update(repositories)
        .set({
          webhookSecret: parsed.data.webhookSecret.trim(),
          updatedAt: new Date(),
        })
        .where(eq(repositories.id, repository.id))
        .returning();
      if (updated) saved = updated;
    }
    await recordAuditEvent({
      action: "integration.update",
      actorId: session.user.id,
      actorEmail: session.user.email,
      workspaceId: access.ctx.project.id,
      targetType: "repository",
      targetId: saved.id,
      request,
      metadata: { remoteUrl: saved.remoteUrl },
    });
    return NextResponse.json(
      { repository: publicRepository(saved) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not create repository" },
      { status: 409 },
    );
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  webhookSecret: z.string().max(512).nullable().optional(),
  defaultBranch: z.string().min(1).max(200).optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "automation.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = patchSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Partial<typeof repositories.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.defaultBranch !== undefined) {
    updates.defaultBranch = parsed.data.defaultBranch;
  }
  if (parsed.data.webhookSecret !== undefined) {
    updates.webhookSecret = parsed.data.webhookSecret?.trim() || null;
  }

  const [updated] = await db
    .update(repositories)
    .set(updates)
    .where(
      and(
        eq(repositories.id, parsed.data.id),
        eq(repositories.workspaceId, access.ctx.project.id),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await recordAuditEvent({
    action: "integration.update",
    actorId: session.user.id,
    actorEmail: session.user.email,
    workspaceId: access.ctx.project.id,
    targetType: "repository",
    targetId: updated.id,
    request,
    metadata: { webhookSecretUpdated: parsed.data.webhookSecret !== undefined },
  });

  return NextResponse.json({ repository: publicRepository(updated) });
}
