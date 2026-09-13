import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceMembers, workspaceRoles } from "@/db/schema";
import {
  ensureSystemRoles,
  listProjectRoles,
} from "@/lib/custom-roles";
import {
  ACTION_CATALOG,
  ACTION_GROUPS,
  ACTION_LABELS,
  inferLegacyRole,
  normalizeActions,
} from "@/lib/permissions";
import { ctxCanAdmin, requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(""),
  actions: z.array(z.string()).default([]),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  actions: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
});

function serializeRole(
  role: typeof workspaceRoles.$inferSelect,
  memberCount = 0,
) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    actions: normalizeActions(role.actions),
    isSystem: role.isSystem,
    systemKey: role.systemKey,
    archivedAt: role.archivedAt,
    memberCount,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
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
  await ensureSystemRoles(workspaceId);
  const includeArchived =
    new URL(request.url).searchParams.get("includeArchived") === "1";
  const roles = await listProjectRoles(workspaceId, { includeArchived });

  const members = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.workspaceId, workspaceId),
  });
  const counts = new Map<string, number>();
  for (const m of members) {
    if (!m.customRoleId) continue;
    counts.set(m.customRoleId, (counts.get(m.customRoleId) ?? 0) + 1);
  }

  return NextResponse.json({
    catalog: {
      actions: ACTION_CATALOG,
      groups: ACTION_GROUPS,
      labels: ACTION_LABELS,
    },
    me: {
      canManageRoles: ctxCanAdmin(access.ctx),
      actions: access.ctx.actions,
    },
    roles: roles.map((r) => serializeRole(r, counts.get(r.id) ?? 0)),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "roles.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const workspaceId = access.ctx.project.id;
  const actions = normalizeActions(parsed.data.actions);
  try {
    const [created] = await db
      .insert(workspaceRoles)
      .values({
        workspaceId,
        name: parsed.data.name,
        description: parsed.data.description,
        actions,
        isSystem: false,
        systemKey: null,
      })
      .returning();
    return NextResponse.json({ role: serializeRole(created) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "A role with that name already exists" },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "roles.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const workspaceId = access.ctx.project.id;
  const existing = await db.query.workspaceRoles.findFirst({
    where: and(
      eq(workspaceRoles.id, parsed.data.id),
      eq(workspaceRoles.workspaceId, workspaceId),
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (existing.isSystem && parsed.data.archived === true) {
    return NextResponse.json(
      { error: "System roles cannot be archived" },
      { status: 400 },
    );
  }

  const updates: Partial<typeof workspaceRoles.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) {
    if (existing.isSystem) {
      return NextResponse.json(
        { error: "System role names cannot be renamed" },
        { status: 400 },
      );
    }
    updates.name = parsed.data.name;
  }
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }
  if (parsed.data.actions !== undefined) {
    updates.actions = normalizeActions(parsed.data.actions);
  }
  if (parsed.data.archived === true) {
    updates.archivedAt = new Date();
  }
  if (parsed.data.archived === false) {
    updates.archivedAt = null;
  }

  try {
    const [updated] = await db
      .update(workspaceRoles)
      .set(updates)
      .where(eq(workspaceRoles.id, existing.id))
      .returning();

    // Keep legacy enum in sync when editing a role that members still use.
    if (parsed.data.actions !== undefined) {
      const legacy = inferLegacyRole(updated.actions);
      if (updated.systemKey) {
        // system role — enum already matches systemKey
      } else {
        await db
          .update(workspaceMembers)
          .set({ role: legacy })
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.customRoleId, updated.id),
            ),
          );
      }
    }

    return NextResponse.json({ role: serializeRole(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "A role with that name already exists" },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "roles.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const workspaceId = access.ctx.project.id;
  const existing = await db.query.workspaceRoles.findFirst({
    where: and(
      eq(workspaceRoles.id, id),
      eq(workspaceRoles.workspaceId, workspaceId),
      isNull(workspaceRoles.archivedAt),
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  if (existing.isSystem) {
    return NextResponse.json(
      { error: "System roles cannot be deleted" },
      { status: 400 },
    );
  }

  const [archived] = await db
    .update(workspaceRoles)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaceRoles.id, existing.id))
    .returning();

  return NextResponse.json({ role: serializeRole(archived) });
}
