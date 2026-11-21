import { and, desc, eq, isNull, inArray, count } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  runs,
  runResults,
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

  if (input.type === "assignment" || input.type === "mention") {
    void import("@/lib/notification-channels")
      .then(({ dispatchNotificationChannels }) =>
        dispatchNotificationChannels(
          input.type as "assignment" | "mention",
          {
            userId: input.userId,
            title: input.title,
            body: input.body ?? "",
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
          },
          input.workspaceId,
        ),
      )
      .catch(() => {});
  }

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
  return notificationDestinations(rows, workspaceId);
}

export async function notificationDestinations(rows: Notification[], workspaceId: string) {
  const resultIds = rows.filter((row) => row.entityType === "result" && row.entityId).map((row) => row.entityId!);
  const resultTargets = resultIds.length ? await db.select({ id: runResults.id, runId: runs.id }).from(runResults).innerJoin(runs, eq(runs.id, runResults.runId)).where(and(eq(runs.workspaceId, workspaceId), inArray(runResults.id, resultIds))) : [];
  const runIds = rows.filter((row) => row.entityType === "run" && row.entityId).map((row) => row.entityId!);
  const runTargets = runIds.length ? await db.select({ id: runs.id }).from(runs).where(and(eq(runs.workspaceId, workspaceId), inArray(runs.id, runIds))) : [];
  return rows.map((row) => {
    let href: string | null = null;
    if (row.entityType === "run" && runTargets.some((run) => run.id === row.entityId)) href = `/runs/${row.entityId}`;
    if (row.entityType === "result") { const target = resultTargets.find((result) => result.id === row.entityId); if (target) href = `/runs/${target.runId}?result=${target.id}`; }
    const routes: Record<string, string> = {
      intent: "/intents",
      requirement: "/requirements",
      component: "/components",
      release: "/releases",
      case: "/cases",
    };
    if (row.entityType === "case" && row.entityId) {
      href = `/cases?case=${row.entityId}`;
    } else if (row.entityType && routes[row.entityType] && row.entityId) {
      href = `${routes[row.entityType]}?${row.entityType}=${row.entityId}`;
    }
    return { ...serializeNotification(row), href, openHref: href ? `/api/notifications/${row.id}/open` : null };
  });
}

export async function countUnreadNotifications(
  userId: string,
  workspaceId: string,
): Promise<number> {
  const [row] = await db.select({ total: count() }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)));
  return Number(row.total);

}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
  workspaceId?: string,
): Promise<boolean> {
  const existing = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId),
      workspaceId ? eq(notifications.workspaceId, workspaceId) : undefined,
    ),
  });
  if (!existing) return false;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, notificationId));
  return true;
}

export async function markAllNotificationsRead(
  userId: string,
  workspaceId: string,
): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
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
