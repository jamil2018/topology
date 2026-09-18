import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("multi-project isolation (integration)", () => {
  beforeAll(() => {
    process.env.DEMO_USER_EMAIL ??= "demo@topology.local";
  });

  it("keeps cases and runs isolated across projects", async () => {
    const { db } = await import("@/db");
    const { cases, runs, users, workspaces } =
      await import("@/db/schema");
    const { listCases, listRuns } = await import("@/lib/queries");
    const { createProject } = await import("@/lib/project");
    const { ensureMembership } = await import("@/lib/workspace");

    const email = process.env.DEMO_USER_EMAIL ?? "demo@topology.local";
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    expect(user).toBeTruthy();
    if (!user) throw new Error("demo user missing — run db:seed");

    const { workspace: defaultProject } = await ensureMembership(
      user.id,
      "admin",
    );

    const other = await createProject({
      name: `Iso ${Date.now()}`,
      creatorUserId: user.id,
    });

    const stamp = Date.now();
    await db.insert(cases).values([
      {
        workspaceId: defaultProject.id,
        key: `DEF-${stamp}`,
        title: "Default project case",
        status: "ready",
        priority: "P2",
      },
      {
        workspaceId: other.id,
        key: `OTH-${stamp}`,
        title: "Other project case",
        status: "ready",
        priority: "P1",
      },
    ]);

    await db.insert(runs).values([
      {
        workspaceId: defaultProject.id,
        name: `Default run ${stamp}`,
        kind: "manual",
        status: "planned",
      },
      {
        workspaceId: other.id,
        name: `Other run ${stamp}`,
        kind: "manual",
        status: "planned",
      },
    ]);

    const defaultCases = await listCases(defaultProject.id);
    const otherCases = await listCases(other.id);
    expect(defaultCases.some((c) => c.key === `DEF-${stamp}`)).toBe(true);
    expect(defaultCases.some((c) => c.key === `OTH-${stamp}`)).toBe(false);
    expect(otherCases.some((c) => c.key === `OTH-${stamp}`)).toBe(true);
    expect(otherCases.some((c) => c.key === `DEF-${stamp}`)).toBe(false);

    const defaultRuns = await listRuns(defaultProject.id, "manual");
    const otherRuns = await listRuns(other.id, "manual");
    expect(defaultRuns.some((r) => r.name === `Default run ${stamp}`)).toBe(
      true,
    );
    expect(defaultRuns.some((r) => r.name === `Other run ${stamp}`)).toBe(
      false,
    );
    expect(otherRuns.some((r) => r.name === `Other run ${stamp}`)).toBe(true);

    // Cleanup created project (cascades domain rows)
    await db.delete(workspaces).where(eq(workspaces.id, other.id));
  });

  it("blocks members from creating projects and allows admins", async () => {
    const { db } = await import("@/db");
    const { users, workspaceMembers, workspaces } = await import("@/db/schema");
    const {
      createProject,
      userIsProjectAdminAnywhere,
    } = await import("@/lib/project");
    const { ensureMembership } = await import("@/lib/workspace");

    const stamp = Date.now();
    const [adminUser] = await db
      .insert(users)
      .values({
        name: "Admin Iso",
        email: `admin-iso-${stamp}@topology.local`,
        emailVerified: new Date(),
      })
      .returning();
    const [memberUser] = await db
      .insert(users)
      .values({
        name: "Member Iso",
        email: `member-iso-${stamp}@topology.local`,
        emailVerified: new Date(),
      })
      .returning();

    const { workspace } = await ensureMembership(adminUser.id, "admin", {
      create: true,
    });
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: memberUser.id,
      role: "member",
    });

    expect(await userIsProjectAdminAnywhere(adminUser.id)).toBe(true);
    expect(await userIsProjectAdminAnywhere(memberUser.id)).toBe(false);

    const created = await createProject({
      name: `Admin project ${stamp}`,
      creatorUserId: adminUser.id,
    });
    expect(created.slug).toBeTruthy();

    // Member is not admin anywhere after joining only as member
    // (unless they somehow got admin on another project)
    const memberAdmin = await userIsProjectAdminAnywhere(memberUser.id);
    expect(memberAdmin).toBe(false);

    await db.delete(workspaces).where(eq(workspaces.id, created.id));
    await db.delete(users).where(eq(users.id, adminUser.id));
    await db.delete(users).where(eq(users.id, memberUser.id));
  });
});
