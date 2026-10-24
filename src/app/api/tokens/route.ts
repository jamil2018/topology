import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import {
  generateApiToken,
  isApiTokenScope,
  serializeTokenScopes,
  type ApiTokenScope,
} from "@/lib/ci-auth";
import { readJsonBody } from "@/lib/http-errors";
import { requireProjectAccess } from "@/lib/project";

function publicToken(row: typeof apiTokens.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scope: row.scope,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export async function GET(request: Request) {
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

  const rows = await db.query.apiTokens.findMany({
    where: and(
      eq(apiTokens.workspaceId, access.ctx.project.id),
      isNull(apiTokens.revokedAt),
    ),
    orderBy: [desc(apiTokens.createdAt)],
  });

  return NextResponse.json({ tokens: rows.map(publicToken) });
}

const tokenScopeEnum = z.enum(["read", "ci-write", "agent"]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scope: z
    .union([tokenScopeEnum, z.array(tokenScopeEnum).min(1)])
    .default("ci-write"),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request) {
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

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = createSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const scopes: ApiTokenScope[] = Array.isArray(parsed.data.scope)
    ? parsed.data.scope.filter(isApiTokenScope)
    : [parsed.data.scope];
  const generated = generateApiToken();
  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "Invalid expiration" }, { status: 400 });
  }
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Expiration must be in the future" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(apiTokens)
    .values({
      workspaceId: access.ctx.project.id,
      name: parsed.data.name,
      tokenHash: generated.hash,
      tokenPrefix: generated.prefix,
      scope: serializeTokenScopes(scopes),
      userId: session.user.id,
      expiresAt,
    })
    .returning();

  await recordAuditEvent({
    action: "token.create",
    actorId: session.user.id,
    actorEmail: session.user.email,
    workspaceId: access.ctx.project.id,
    targetType: "api_token",
    targetId: row.id,
    request,
    metadata: { name: row.name, scope: row.scope, prefix: row.tokenPrefix },
  });

  return NextResponse.json({
    token: publicToken(row),
    plaintext: generated.token,
  });
}

const revokeSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: Request) {
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

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = revokeSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, parsed.data.id),
        eq(apiTokens.workspaceId, access.ctx.project.id),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await recordAuditEvent({
    action: "token.revoke",
    actorId: session.user.id,
    actorEmail: session.user.email,
    workspaceId: access.ctx.project.id,
    targetType: "api_token",
    targetId: updated.id,
    request,
    metadata: { name: updated.name, prefix: updated.tokenPrefix },
  });

  return NextResponse.json({ ok: true, token: publicToken(updated) });
}
