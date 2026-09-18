import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceInvites, workspaceMembers } from "@/db/schema";
import { isUniqueViolation } from "@/lib/http-errors";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const invite = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.token, token),
    with: { workspace: true },
  });

  if (!invite || invite.status !== "pending") {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  return NextResponse.json({
    invite: {
      email: invite.email,
      role: invite.role,
      workspace: {
        name: invite.workspace.name,
        slug: invite.workspace.slug,
      },
      expiresAt: invite.expiresAt,
    },
  });
}

export async function POST(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in to accept invite" }, { status: 401 });
  }

  const { token } = await params;
  const invite = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.token, token),
  });

  if (!invite || invite.status !== "pending") {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  const sessionEmail = session.user.email.toLowerCase();
  if (sessionEmail !== invite.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: `Signed in as ${sessionEmail}, but invite is for ${invite.email}`,
      },
      { status: 403 },
    );
  }

  const existing = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, invite.workspaceId),
      eq(workspaceMembers.userId, session.user.id),
    ),
  });

  if (existing) {
    return NextResponse.json(
      { error: "Already a member of this project" },
      { status: 409 },
    );
  }

  try {
    await db.insert(workspaceMembers).values({
      workspaceId: invite.workspaceId,
      userId: session.user.id,
      role: invite.role,
      customRoleId: invite.customRoleId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Already a member of this project" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Invite accept failed" }, { status: 400 });
  }

  await db
    .update(workspaceInvites)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(
      and(
        eq(workspaceInvites.id, invite.id),
        eq(workspaceInvites.status, "pending"),
      ),
    );

  return NextResponse.json({ ok: true });
}
