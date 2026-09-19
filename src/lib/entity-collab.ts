import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  entityComments,
  entityOwners,
  requirements,
  testIntents,
} from "@/db/schema";

export type CollabEntityType = "intent" | "requirement";

export function serializeOwner(
  row: {
    id: string;
    userId: string;
    user?: { id: string; name: string | null; email: string } | null;
  } | null,
) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    user: row.user
      ? { id: row.user.id, name: row.user.name, email: row.user.email }
      : null,
  };
}

export function serializeComment(row: {
  id: string;
  body: string;
  createdAt: Date;
  user?: { id: string; name: string | null; email: string } | null;
}) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    user: row.user
      ? { id: row.user.id, name: row.user.name, email: row.user.email }
      : null,
  };
}

export async function entityExistsInWorkspace(
  workspaceId: string,
  entityType: CollabEntityType,
  entityId: string,
): Promise<boolean> {
  if (entityType === "intent") {
    const row = await db.query.testIntents.findFirst({
      where: and(
        eq(testIntents.id, entityId),
        eq(testIntents.workspaceId, workspaceId),
      ),
      columns: { id: true },
    });
    return Boolean(row);
  }
  const row = await db.query.requirements.findFirst({
    where: and(
      eq(requirements.id, entityId),
      eq(requirements.workspaceId, workspaceId),
    ),
    columns: { id: true },
  });
  return Boolean(row);
}

export async function listEntityComments(
  workspaceId: string,
  entityType: CollabEntityType,
  entityId: string,
) {
  const rows = await db.query.entityComments.findMany({
    where: and(
      eq(entityComments.workspaceId, workspaceId),
      eq(entityComments.entityType, entityType),
      eq(entityComments.entityId, entityId),
    ),
    with: { user: true },
    orderBy: [asc(entityComments.createdAt)],
  });
  return rows.map(serializeComment);
}

export async function createEntityComment(input: {
  workspaceId: string;
  entityType: CollabEntityType;
  entityId: string;
  userId: string;
  body: string;
}) {
  const [created] = await db
    .insert(entityComments)
    .values({
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId,
      body: input.body,
    })
    .returning();
  return created;
}

export async function getEntityOwner(
  workspaceId: string,
  entityType: CollabEntityType,
  entityId: string,
) {
  const row = await db.query.entityOwners.findFirst({
    where: and(
      eq(entityOwners.workspaceId, workspaceId),
      eq(entityOwners.entityType, entityType),
      eq(entityOwners.entityId, entityId),
    ),
    with: { user: true },
  });
  return serializeOwner(row ?? null);
}

export async function setEntityOwner(input: {
  workspaceId: string;
  entityType: CollabEntityType;
  entityId: string;
  userId: string | null;
}) {
  const existing = await db.query.entityOwners.findFirst({
    where: and(
      eq(entityOwners.workspaceId, input.workspaceId),
      eq(entityOwners.entityType, input.entityType),
      eq(entityOwners.entityId, input.entityId),
    ),
  });

  if (input.userId == null) {
    if (existing) {
      await db
        .delete(entityOwners)
        .where(eq(entityOwners.id, existing.id));
    }
    return null;
  }

  if (existing) {
    const [updated] = await db
      .update(entityOwners)
      .set({ userId: input.userId })
      .where(eq(entityOwners.id, existing.id))
      .returning();
    const withUser = await db.query.entityOwners.findFirst({
      where: eq(entityOwners.id, updated.id),
      with: { user: true },
    });
    return serializeOwner(withUser ?? null);
  }

  const [created] = await db
    .insert(entityOwners)
    .values({
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId,
    })
    .returning();
  const withUser = await db.query.entityOwners.findFirst({
    where: eq(entityOwners.id, created.id),
    with: { user: true },
  });
  return serializeOwner(withUser ?? null);
}
