import { describe, expect, it } from "vitest";
import { canAdmin, canWrite, hasAtLeast, ROLE_RANK } from "./workspace-roles";

describe("workspace roles", () => {
  it("ranks admin above member above viewer", () => {
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.member);
    expect(ROLE_RANK.member).toBeGreaterThan(ROLE_RANK.viewer);
  });

  it("allows write for admin and member only", () => {
    expect(canWrite("admin")).toBe(true);
    expect(canWrite("member")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
    expect(canWrite(null)).toBe(false);
  });

  it("allows admin checks", () => {
    expect(canAdmin("admin")).toBe(true);
    expect(canAdmin("member")).toBe(false);
  });

  it("checks minimum role", () => {
    expect(hasAtLeast("viewer", "viewer")).toBe(true);
    expect(hasAtLeast("member", "admin")).toBe(false);
    expect(hasAtLeast("admin", "member")).toBe(true);
  });
});
