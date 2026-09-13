import { describe, expect, it } from "vitest";
import { slugifyProjectName } from "./project";
import { canAdmin, canWrite } from "./workspace-roles";

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
