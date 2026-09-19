import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markNotificationRead,
} from "@/lib/notifications";
import { authorizeNotificationsAccess } from "@/lib/coverage-snapshot-auth";

const patchSchema = z.object({
  id: z.string().uuid(),
  read: z.literal(true),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await authorizeNotificationsAccess(request, session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const workspaceId = access.ctx.project.id;
  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(session.user.id, workspaceId),
    countUnreadNotifications(session.user.id, workspaceId),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await authorizeNotificationsAccess(request, session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ok = await markNotificationRead(session.user.id, parsed.data.id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
