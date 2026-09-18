import { describe, expect, it } from "vitest";
import {
  ctxCanAdmin,
  ctxCanWrite,
  membershipActions,
  pickAccessibleProject,
  slugifyProjectName,
  type ActiveProjectContext,
  type MembershipWithRole,
} from "./project";
import { canAdmin, canWrite } from "./workspace-roles";

describe("pickAccessibleProject", () => {
  const projects = [
    { id: "default", name: "Topology" },
    { id: "test", name: "Test" },
  ];

  it("selects the preferred project when the user belongs to it", () => {
    expect(pickAccessibleProject(projects, "test")).toEqual(projects[1]);
  });

  it("uses the first project only when no preference was sent", () => {
    expect(pickAccessibleProject(projects, null)).toEqual(projects[0]);
    expect(pickAccessibleProject(projects, undefined)).toEqual(projects[0]);
    expect(pickAccessibleProject(projects, "")).toEqual(projects[0]);
    expect(pickAccessibleProject(projects, "   ")).toEqual(projects[0]);
  });

  it("rejects an id that is unknown, malformed, or not in the list", () => {
    expect(pickAccessibleProject(projects, "foreign")).toBeUndefined();
    expect(pickAccessibleProject(projects, "not-a-uuid")).toBeUndefined();
    expect(
      pickAccessibleProject(projects, "11111111-1111-4111-8111-111111111111"),
    ).toBeUndefined();
    expect(pickAccessibleProject(projects, " test ")).toEqual(projects[1]);
  });

  it("returns undefined when the user has no projects", () => {
    expect(pickAccessibleProject([], "test")).toBeUndefined();
  });
});

describe("slugifyProjectName", () => {
  it("normalizes names into URL-safe slugs", () => {
    expect(slugifyProjectName("Acme QA")).toBe("acme-qa");
    expect(slugifyProjectName("  Foo_Bar!! ")).toBe("foo-bar");
  });

  it("falls back when empty", () => {
    expect(slugifyProjectName("!!!")).toBe("project");
  });
});

describe("project role gates", () => {
  it("members cannot admin-manage projects", () => {
    expect(canAdmin("member")).toBe(false);
    expect(canWrite("member")).toBe(true);
  });

  it("viewers cannot write project data", () => {
    expect(canWrite("viewer")).toBe(false);
    expect(canAdmin("viewer")).toBe(false);
  });
});

describe("membershipActions", () => {
  function member(
    role: "admin" | "member" | "viewer",
    actions?: string[],
  ): MembershipWithRole {
    return {
      id: "m1",
      workspaceId: "w1",
      userId: "u1",
      role,
      customRoleId: actions ? "r1" : null,
      createdAt: new Date(),
      customRole: actions
        ? {
            id: "r1",
            workspaceId: "w1",
            name: "Custom",
            description: "",
            actions,
            isSystem: false,
            systemKey: null,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : null,
    };
  }

  it("uses custom role actions when present", () => {
    const actions = membershipActions(
      member("member", ["runs.view", "runs.complete"]),
    );
    expect(actions).toEqual(["runs.view", "runs.complete"]);
  });

  it("falls back to legacy enum matrix", () => {
    const actions = membershipActions(member("viewer"));
    expect(actions).toContain("cases.view");
    expect(actions).not.toContain("cases.create");
    expect(actions).not.toContain("runs.complete");
  });

  it("ignores edited actions on the Viewer system role", () => {
    const viewer = member("viewer", [
      "roles.manage",
      "project.manage",
      "members.invite",
    ]);
    viewer.customRole!.isSystem = true;
    viewer.customRole!.systemKey = "viewer";
    viewer.customRole!.name = "Viewer";
    const ctx: ActiveProjectContext = {
      project: { id: "w1" } as ActiveProjectContext["project"],
      membership: viewer,
      projects: [],
      actions: membershipActions(viewer),
    };
    expect(ctx.actions).not.toContain("roles.manage");
    expect(ctx.actions).toContain("cases.view");
    expect(ctxCanAdmin(ctx)).toBe(false);
    expect(ctxCanWrite(ctx)).toBe(false);
  });

  it("does not grant write to a custom invite-only role stored as admin", () => {
    const inviter = member("admin", ["members.invite"]);
    const ctx: ActiveProjectContext = {
      project: { id: "w1" } as ActiveProjectContext["project"],
      membership: inviter,
      projects: [],
      actions: membershipActions(inviter),
    };
    expect(ctxCanWrite(ctx)).toBe(false);
    expect(ctxCanAdmin(ctx)).toBe(true);
  });
});
