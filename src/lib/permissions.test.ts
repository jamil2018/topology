import { describe, expect, it } from "vitest";
import {
  ACTION_CATALOG,
  actionsAllowAdmin,
  actionsAllowWrite,
  inferLegacyRole,
  isAction,
  legacyRoleHasAction,
  normalizeActions,
  roleHasAction,
  SYSTEM_ROLE_ACTIONS,
} from "./permissions";

describe("permissions catalog", () => {
  it("exposes a stable allow-list of action keys", () => {
    expect(ACTION_CATALOG).toContain("cases.view");
    expect(ACTION_CATALOG).toContain("intents.view");
    expect(ACTION_CATALOG).toContain("requirements.create");
    expect(ACTION_CATALOG).toContain("proposals.view");
    expect(ACTION_CATALOG).toContain("proposals.review");
    expect(ACTION_CATALOG).toContain("releases.view");
    expect(ACTION_CATALOG).toContain("journeys.create");
    expect(ACTION_CATALOG).toContain("runs.complete");
    expect(ACTION_CATALOG).toContain("roles.manage");
    expect(ACTION_CATALOG).toContain("members.invite");
    expect(isAction("cases.create")).toBe(true);
    expect(isAction("cases.explode")).toBe(false);
  });

  it("normalizes unknown actions out of custom sets", () => {
    expect(
      normalizeActions(["cases.view", "not.real", "roles.manage", "cases.view"]),
    ).toEqual(["cases.view", "roles.manage"]);
  });
});

describe("system role action matrices", () => {
  it("allows admin every cataloged action", () => {
    for (const action of ACTION_CATALOG) {
      expect(legacyRoleHasAction("admin", action)).toBe(true);
    }
  });

  it("denies members project/role administration", () => {
    expect(legacyRoleHasAction("member", "cases.create")).toBe(true);
    expect(legacyRoleHasAction("member", "runs.complete")).toBe(true);
    expect(legacyRoleHasAction("member", "roles.manage")).toBe(false);
    expect(legacyRoleHasAction("member", "members.invite")).toBe(false);
    expect(legacyRoleHasAction("member", "project.manage")).toBe(false);
  });

  it("denies viewers write and complete actions", () => {
    expect(legacyRoleHasAction("viewer", "cases.view")).toBe(true);
    expect(legacyRoleHasAction("viewer", "cases.create")).toBe(false);
    expect(legacyRoleHasAction("viewer", "runs.edit")).toBe(false);
    expect(legacyRoleHasAction("viewer", "runs.complete")).toBe(false);
    expect(legacyRoleHasAction("viewer", "roles.manage")).toBe(false);
  });
});

describe("roleHasAction allow/deny", () => {
  it("allows listed actions and denies missing ones", () => {
    const runner = ["runs.view", "runs.create", "runs.complete"] as const;
    expect(roleHasAction(runner, "runs.complete")).toBe(true);
    expect(roleHasAction(runner, "runs.delete")).toBe(false);
    expect(roleHasAction(runner, "cases.create")).toBe(false);
    expect(roleHasAction([], "runs.view")).toBe(false);
    expect(roleHasAction(null, "runs.view")).toBe(false);
  });

  it("maps action sets onto legacy write/admin helpers", () => {
    expect(actionsAllowWrite(SYSTEM_ROLE_ACTIONS.member)).toBe(true);
    expect(actionsAllowAdmin(SYSTEM_ROLE_ACTIONS.member)).toBe(false);
    expect(actionsAllowWrite(SYSTEM_ROLE_ACTIONS.viewer)).toBe(false);
    expect(actionsAllowAdmin(SYSTEM_ROLE_ACTIONS.admin)).toBe(true);
    expect(inferLegacyRole(SYSTEM_ROLE_ACTIONS.admin)).toBe("member");
    expect(inferLegacyRole(SYSTEM_ROLE_ACTIONS.member)).toBe("member");
    expect(inferLegacyRole(SYSTEM_ROLE_ACTIONS.viewer)).toBe("viewer");
    expect(inferLegacyRole(["cases.view", "roles.manage"])).toBe("viewer");
    expect(inferLegacyRole(["members.invite"])).toBe("viewer");
    expect(inferLegacyRole(["cases.create", "project.manage"])).toBe("member");
  });
});
