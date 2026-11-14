import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { serializeTokenScopes } from "../lib/api-token-scopes";
import { hashToken, tokenLookupHashes } from "../lib/ci-auth";
import { getSystemRole } from "../lib/custom-roles";
import { inferLegacyRole } from "../lib/permissions";
import { db } from "./index";
import {
  apiTokens,
  cases,
  users,
  workspaceMembers,
  workspaceRoles,
  workspaces,
  type WorkspaceRole,
} from "./schema";
import {
  assertE2eCatalog,
  E2E_CUSTOM_ROLE,
  E2E_PROJECTS,
  E2E_TOKENS,
  E2E_USERS,
} from "./seed-e2e-catalog";

/**
 * Adds e2e users, projects, and tokens on top of the demo seed.
 * Does not remove or rewrite `demo@topology.local`.
 * Safe to run again: existing rows are updated in place.
 */
export async function seedE2eFixtures(input: {
  workspaceId: string;
  user: { id: string };
}) {
  assertE2eCatalog();
  const { workspaceId, user } = input;

  const memberRole = await getSystemRole(workspaceId, "member");
  const viewerRole = await getSystemRole(workspaceId, "viewer");
  const customRole = await ensureCustomRole(workspaceId);

  const member = await ensureUser(E2E_USERS.member);
  await ensureMembership(workspaceId, member.id, "member", memberRole.id);

  const viewer = await ensureUser(E2E_USERS.viewer);
  await ensureMembership(workspaceId, viewer.id, "viewer", viewerRole.id);

  const custom = await ensureUser(E2E_USERS.custom);
  await ensureMembership(
    workspaceId,
    custom.id,
    inferLegacyRole(E2E_CUSTOM_ROLE.actions),
    customRole.id,
  );

  const harborBeta = await ensureWorkspace(
    E2E_PROJECTS.harborBeta.name,
    E2E_PROJECTS.harborBeta.slug,
    user.id,
  );
  await ensureCase(
    harborBeta.id,
    user.id,
    E2E_PROJECTS.harborBeta.caseKey,
    E2E_PROJECTS.harborBeta.caseTitle,
  );

  const other = await ensureUser(E2E_USERS.other);
  const foreign = await ensureWorkspace(
    E2E_PROJECTS.foreign.name,
    E2E_PROJECTS.foreign.slug,
    other.id,
  );
  await ensureCase(
    foreign.id,
    other.id,
    E2E_PROJECTS.foreign.caseKey,
    E2E_PROJECTS.foreign.caseTitle,
  );

  for (const spec of Object.values(E2E_TOKENS)) {
    await ensureToken({
      workspaceId,
      userId: user.id,
      token: spec.token,
      name: spec.name,
      scopes: spec.scopes,
      revoked: spec.revoked,
    });
  }

  console.log(
    `E2E logins: ${E2E_USERS.member.email} / ${E2E_USERS.member.password}, ${E2E_USERS.viewer.email} / ${E2E_USERS.viewer.password}, ${E2E_USERS.custom.email} / ${E2E_USERS.custom.password}, ${E2E_USERS.other.email} / ${E2E_USERS.other.password}`,
  );
  console.log(
    `E2E projects: “${E2E_PROJECTS.harborBeta.name}” (demo admin, case ${E2E_PROJECTS.harborBeta.caseKey}); “${E2E_PROJECTS.foreign.name}” (${E2E_USERS.other.email} admin, case ${E2E_PROJECTS.foreign.caseKey})`,
  );
  console.log(
    `E2E tokens on the Harbor project: ${Object.values(E2E_TOKENS)
      .map((spec) => `${spec.token}${spec.revoked ? " (revoked)" : ""}`)
      .join(", ")}`,
  );
}

async function ensureUser(spec: {
  email: string;
  password: string;
  name: string;
}) {
  const passwordHash = await bcrypt.hash(spec.password, 10);
  const existing = await db.query.users.findFirst({
    where: eq(users.email, spec.email),
  });
  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        name: spec.name,
        passwordHash,
        emailVerified: existing.emailVerified ?? new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      name: spec.name,
      email: spec.email,
      passwordHash,
      emailVerified: new Date(),
    })
    .returning();
  return created;
}

async function ensureMembership(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
  customRoleId: string,
) {
  const existing = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId),
    ),
  });
  if (existing) {
    if (existing.role !== role || existing.customRoleId !== customRoleId) {
      await db
        .update(workspaceMembers)
        .set({ role, customRoleId })
        .where(eq(workspaceMembers.id, existing.id));
    }
    return;
  }

  await db.insert(workspaceMembers).values({
    workspaceId,
    userId,
    role,
    customRoleId,
  });
}

async function ensureCustomRole(workspaceId: string) {
  const actions = [...E2E_CUSTOM_ROLE.actions];
  const existing = await db.query.workspaceRoles.findFirst({
    where: and(
      eq(workspaceRoles.workspaceId, workspaceId),
      eq(workspaceRoles.name, E2E_CUSTOM_ROLE.name),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(workspaceRoles)
      .set({
        description: E2E_CUSTOM_ROLE.description,
        actions,
        isSystem: false,
        systemKey: null,
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaceRoles.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(workspaceRoles)
    .values({
      workspaceId,
      name: E2E_CUSTOM_ROLE.name,
      description: E2E_CUSTOM_ROLE.description,
      actions,
      isSystem: false,
    })
    .returning();
  return created;
}

async function ensureWorkspace(
  name: string,
  slug: string,
  adminUserId: string,
) {
  let workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, slug),
  });
  if (!workspace) {
    const [created] = await db
      .insert(workspaces)
      .values({ name, slug })
      .returning();
    workspace = created;
  } else if (workspace.name !== name || workspace.archivedAt != null) {
    const [updated] = await db
      .update(workspaces)
      .set({ name, archivedAt: null, updatedAt: new Date() })
      .where(eq(workspaces.id, workspace.id))
      .returning();
    if (updated) workspace = updated;
  }

  const adminRole = await getSystemRole(workspace.id, "admin");
  await ensureMembership(workspace.id, adminUserId, "admin", adminRole.id);
  return workspace;
}

async function ensureCase(
  workspaceId: string,
  userId: string,
  key: string,
  title: string,
) {
  const existing = await db.query.cases.findFirst({
    where: and(eq(cases.workspaceId, workspaceId), eq(cases.key, key)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(cases)
    .values({
      workspaceId,
      key,
      title,
      description: "E2E fixture.",
      preconditions: "",
      steps: "1. Open the case.",
      expectedResult: "The case belongs to this project.",
      priority: "P2",
      status: "ready",
      tags: ["e2e"],
      createdById: userId,
    })
    .returning();
  return created;
}

async function ensureToken(input: {
  workspaceId: string;
  userId: string;
  token: string;
  name: string;
  scopes: readonly ("read" | "ci-write" | "agent")[];
  revoked: boolean;
}) {
  const hashes = tokenLookupHashes(input.token);
  const existing = await db.query.apiTokens.findFirst({
    where: inArray(apiTokens.tokenHash, hashes),
  });
  const scope = serializeTokenScopes([...input.scopes]);
  const revokedAt = input.revoked
    ? (existing?.revokedAt ?? new Date())
    : null;

  if (existing) {
    await db
      .update(apiTokens)
      .set({
        workspaceId: input.workspaceId,
        userId: input.userId,
        name: input.name,
        scope,
        revokedAt,
        tokenPrefix: input.token.slice(0, 12),
      })
      .where(eq(apiTokens.id, existing.id));
    return;
  }

  await db.insert(apiTokens).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    name: input.name,
    tokenHash: hashToken(input.token),
    tokenPrefix: input.token.slice(0, 12),
    scope,
    revokedAt,
  });
}
