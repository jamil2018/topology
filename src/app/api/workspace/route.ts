import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  users,
  workspaceInvites,
  workspaceMembers,
} from "@/db/schema";
import { findActiveRole, getSystemRole } from "@/lib/custom-roles";
import { inferLegacyRole } from "@/lib/permissions";
import {
  ctxCanAdmin,
  ctxCanWrite,
  requireProjectAccess,
} from "@/lib/project";
import { ensureMembership } from "@/lib/workspace";

const inviteSchema = z
  .object({
    email: z.string().email(),
    role: z.enum(["admin", "member", "viewer"]).optional(),
    roleId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.role || v.roleId), {
    message: "role or roleId required",
  });

const roleSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(["admin", "member", "viewer"]).optional(),
    roleId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.role || v.roleId), {
    message: "role or roleId required",
  });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureMembership(session.user.id, "admin");
  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { project: workspace, membership } = access.ctx;

  const members = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.workspaceId, workspace.id),
    with: { user: true, customRole: true },
    orderBy: [desc(workspaceMembers.createdAt)],
  });

  const invites = await db.query.workspaceInvites.findMany({
    where: and(
      eq(workspaceInvites.workspaceId, workspace.id),
      eq(workspaceInvites.status, "pending"),
    ),
    with: { customRole: true },
    orderBy: [desc(workspaceInvites.createdAt)],
  });

  return NextResponse.json({
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    me: {
      userId: session.user.id,
      role: membership.role,
      roleId: membership.customRoleId,
      canAdmin: ctxCanAdmin(access.ctx),
      canWrite: ctxCanWrite(access.ctx),
      actions: access.ctx.actions,
    },
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      roleId: m.customRoleId,
      customRole: m.customRole
        ? {
            id: m.customRole.id,
            name: m.customRole.name,
            isSystem: m.customRole.isSystem,
            systemKey: m.customRole.systemKey,
          }
        : null,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
      },
      createdAt: m.createdAt,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      roleId: i.customRoleId,
      customRole: i.customRole
        ? { id: i.customRole.id, name: i.customRole.name }
        : null,
      token: i.token,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureMembership(session.user.id, "admin");
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "members.invite",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const workspace = access.ctx.project;

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let customRole =
    parsed.data.roleId != null
      ? await findActiveRole(workspace.id, parsed.data.roleId)
      : null;
  if (parsed.data.roleId && !customRole) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  if (!customRole) {
    customRole = await getSystemRole(
      workspace.id,
      parsed.data.role ?? "member",
    );
  }

  const legacyRole =
    customRole.systemKey ?? inferLegacyRole(customRole.actions);

  const email = parsed.data.email.toLowerCase();
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existingUser) {
    const already = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, existingUser.id),
      ),
    });
    if (already) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 409 },
      );
    }
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invite] = await db
    .insert(workspaceInvites)
    .values({
      workspaceId: workspace.id,
      email,
      role: legacyRole,
      customRoleId: customRole.id,
      token,
      invitedById: session.user.id,
      expiresAt,
      status: "pending",
    })
    .returning();

  const base =
    process.env.AUTH_URL ?? process.env.TOPOLOGY_URL ?? "http://127.0.0.1:4317";
  return NextResponse.json(
    {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        roleId: invite.customRoleId,
        token: invite.token,
        expiresAt: invite.expiresAt,
        acceptUrl: `${base.replace(/\/$/, "")}/invite/${invite.token}`,
      },
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureMembership(session.user.id, "admin");
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "roles.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const workspace = access.ctx.project;

  const body = await request.json();
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let customRole =
    parsed.data.roleId != null
      ? await findActiveRole(workspace.id, parsed.data.roleId)
      : null;
  if (parsed.data.roleId && !customRole) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  if (!customRole) {
    customRole = await getSystemRole(workspace.id, parsed.data.role!);
  }

  const legacyRole =
    customRole.systemKey ?? inferLegacyRole(customRole.actions);

  if (
    parsed.data.userId === session.user.id &&
    legacyRole !== "admin" &&
    !customRole.actions.includes("roles.manage")
  ) {
    return NextResponse.json(
      { error: "Cannot demote yourself" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(workspaceMembers)
    .set({ role: legacyRole, customRoleId: customRole.id })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, parsed.data.userId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json({
    member: {
      ...updated,
      roleId: updated.customRoleId,
    },
  });
}
