import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, workspaceMembers } from "@/db/schema";
import { clientIp, clientUserAgent } from "@/lib/request-meta";

export const AUDIT_ACTIONS = [
  "login.success",
  "login.failure",
  "setup.admin_created",
  "role.change",
  "token.create",
  "token.revoke",
  "webhook.create",
  "webhook.update",
  "webhook.delete",
  "integration.update",
  "export.cases",
  "import.cases",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {});

export type RecordAuditInput = {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  workspaceId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  request?: Request | null;
};

export async function recordAuditEvent(input: RecordAuditInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      action: input.action,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      workspaceId: input.workspaceId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      ip: input.ip ?? clientIp(input.request) ?? null,
      userAgent: input.userAgent ?? clientUserAgent(input.request) ?? null,
    });
  } catch (err) {
    console.error("Failed to record audit event", input.action, err);
  }
}

export async function listAuditEvents(options: {
  workspaceId: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const members = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.workspaceId, options.workspaceId),
    columns: { userId: true },
  });
  const memberIds = members.map((row) => row.userId);
  return db.query.auditEvents.findMany({
    where: or(
      eq(auditEvents.workspaceId, options.workspaceId),
      memberIds.length > 0
        ? and(
            isNull(auditEvents.workspaceId),
            inArray(auditEvents.actorId, memberIds),
          )
        : undefined,
    ),
    orderBy: [desc(auditEvents.createdAt)],
    limit,
  });
}
