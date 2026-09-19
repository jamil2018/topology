import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  workspaceMembers,
  type Notification,
} from "@/db/schema";

export type CreateNotificationInput = {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  entityType?: string | null;
  entityId?: string | null;
};

export async function createNotification(
  input: CreateNotificationInput,
): Promise<Notification> {
  const [row] = await db
    .insert(notifications)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })
    .returning();
  return row;
}

export function serializeNotification(row: Notification) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export async function listNotificationsForUser(
  userId: string,
  workspaceId: string,
  limit = 30,
) {
  const rows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.userId, userId),
      eq(notifications.workspaceId, workspaceId),
    ),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
  return rows.map(serializeNotification);
}

export async function countUnreadNotifications(
  userId: string,
  workspaceId: string,
): Promise<number> {
  const rows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.userId, userId),
      eq(notifications.workspaceId, workspaceId),
      isNull(notifications.readAt),
    ),
    columns: { id: true },
  });
  return rows.length;
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const existing = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId),
    ),
  });
  if (!existing) return false;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, notificationId));
  return true;
}

const EMAIL_MENTION = /@([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const UUID_MENTION =
  /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/** Parse @email and @userId tokens from a comment body. */
export async function notifyEntityCommentMentions(input: {
  workspaceId: string;
  authorUserId: string;
  entityType: string;
  entityId: string;
  body: string;
}) {
  const { emails, userIds } = parseMentionTokens(input.body);
  if (emails.length === 0 && userIds.length === 0) return;

  const members = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.workspaceId, input.workspaceId),
    with: { user: true },
  });

  for (const member of members) {
    const user = member.user;
    if (!user || user.id === input.authorUserId) continue;
    const emailHit = emails.includes(user.email.toLowerCase());
    const idHit = userIds.includes(user.id.toLowerCase());
    if (!emailHit && !idHit) continue;

    await createNotification({
      workspaceId: input.workspaceId,
      userId: user.id,
      type: "mention",
      title: "You were mentioned in a comment",
      body: input.body.slice(0, 280),
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
}

export function parseMentionTokens(body: string): {
  emails: string[];
  userIds: string[];
} {
  const emails = new Set<string>();
  const userIds = new Set<string>();
  for (const match of body.matchAll(EMAIL_MENTION)) {
    emails.add(match[1].toLowerCase());
  }
  for (const match of body.matchAll(UUID_MENTION)) {
    userIds.add(match[1].toLowerCase());
  }
  return {
    emails: [...emails],
    userIds: [...userIds],
  };
}
