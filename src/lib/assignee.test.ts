import { describe, expect, it } from "vitest";
import { SYSTEM_ROLE_ACTIONS } from "./permissions";
import { assigneeDecision, parseAssigneeInput } from "./assignee";

describe("parseAssigneeInput", () => {
  it("accepts a uuid and treats null or empty as unassign", () => {
    expect(parseAssigneeInput("11111111-1111-4111-8111-111111111111")).toEqual({
      ok: true,
      assigneeId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parseAssigneeInput(null)).toEqual({ ok: true, assigneeId: null });
    expect(parseAssigneeInput("")).toEqual({ ok: true, assigneeId: null });
  });

  it("rejects missing and non-uuid values", () => {
    expect(parseAssigneeInput(undefined).ok).toBe(false);
    expect(parseAssigneeInput("viewer").ok).toBe(false);
    expect(parseAssigneeInput("not-a-uuid").ok).toBe(false);
  });
});

describe("assigneeDecision", () => {
  it("rejects unknown users and viewers", () => {
    expect(assigneeDecision(null, "runs.edit")).toEqual({
      ok: false,
      status: 400,
      error: "Assignee is not a member of this project",
    });
    expect(
      assigneeDecision(
        { role: "viewer", actions: SYSTEM_ROLE_ACTIONS.viewer },
        "runs.edit",
      ),
    ).toEqual({
      ok: false,
      status: 403,
      error: "Viewers cannot be assigned",
    });
  });

  it("allows members and admins who have the edit action", () => {
    expect(
      assigneeDecision(
        { role: "member", actions: SYSTEM_ROLE_ACTIONS.member },
        "cases.edit",
      ).ok,
    ).toBe(true);
    expect(
      assigneeDecision(
        { role: "admin", actions: SYSTEM_ROLE_ACTIONS.admin },
        "runs.edit",
      ).ok,
    ).toBe(true);
  });
});
