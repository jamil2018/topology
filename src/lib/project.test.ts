import { describe, expect, it } from "vitest";
import {
  membershipActions,
  pickAccessibleProject,
  slugifyProjectName,
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

  it("ignores a preferred id the user cannot access", () => {
    expect(pickAccessibleProject(projects, "foreign")).toEqual(projects[0]);
    expect(pickAccessibleProject(projects, null)).toEqual(projects[0]);
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
});
