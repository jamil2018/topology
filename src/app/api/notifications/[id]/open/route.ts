import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireProjectAccess, PROJECT_COOKIE } from "@/lib/project";
import { markNotificationRead, notificationDestinations } from "@/lib/notifications";

/** Resolve the current target, mark read, and carry project context across tabs and project switches. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid notification" }, { status: 400 });
  const row = await db.query.notifications.findFirst({ where: and(eq(notifications.id, id), eq(notifications.userId, session.user.id)) });
  if (!row) return NextResponse.json({ error: "Notification unavailable" }, { status: 404 });
  const access = await requireProjectAccess(session.user.id, { preferredId: row.workspaceId });
  if (!access.ok) return NextResponse.json({ error: "This project is no longer available" }, { status: 404 });
  const [resolved] = await notificationDestinations([row], row.workspaceId);
  if (!resolved.href) return NextResponse.json({ error: "This item is no longer available" }, { status: 404 });
  if (!row.readAt) {
    await markNotificationRead(session.user.id, id, row.workspaceId);
  }
  const response = NextResponse.redirect(new URL(resolved.href, request.url));
  response.cookies.set(PROJECT_COOKIE, row.workspaceId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return response;
}
