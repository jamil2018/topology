import { describe, expect, it } from "vitest";
import { buildCasePatch, unionTags, updateCaseSchema } from "./case-update";

const base = {
  title: "Login happy path",
  description: "desc",
  preconditions: "user exists",
  steps: "1. open /login",
  expectedResult: "lands on hub",
  priority: "P2",
  status: "draft",
  folderId: null as string | null,
  tags: ["smoke"],
};

describe("updateCaseSchema", () => {
  it("requires at least one field", () => {
    expect(updateCaseSchema.safeParse({}).success).toBe(false);
    expect(
      updateCaseSchema.safeParse({ title: "Updated title" }).success,
    ).toBe(true);
  });

  it("accepts nullable folderId and status/priority enums", () => {
    const parsed = updateCaseSchema.safeParse({
      folderId: null,
      status: "ready",
      priority: "P0",
      steps: "1. click KEY\n2. edit",
      tags: ["smoke", "ui"],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("buildCasePatch", () => {
  it("diffs only changed fields and maps folder labels for activity", () => {
    const folderId = "11111111-1111-1111-1111-111111111111";
    const result = buildCasePatch(
      base,
      {
        title: "Login happy path",
        status: "ready",
        folderId,
        steps: "1. open /login\n2. submit",
        tags: ["smoke", "ui"],
      },
      new Map([[folderId, "Auth"]]),
    );

    expect(result.fields.sort()).toEqual(
      ["folderId", "status", "steps", "tags"].sort(),
    );
    expect(result.patch).toMatchObject({
      status: "ready",
      folderId,
      steps: "1. open /login\n2. submit",
      tags: ["smoke", "ui"],
    });
    expect(result.before.folderId).toBe("unfiled");
    expect(result.after.folderId).toBe("Auth");
    expect(result.before.status).toBe("draft");
    expect(result.after.status).toBe("ready");
  });

  it("returns empty fields when payload matches existing", () => {
    const result = buildCasePatch(base, {
      title: base.title,
      tags: ["smoke"],
      status: "draft",
    });
    expect(result.fields).toEqual([]);
  });
});

describe("unionTags", () => {
  it("keeps existing tags and appends both sides of a concurrent add", () => {
    expect(unionTags(["base"], ["alpha"])).toEqual(["base", "alpha"]);
    expect(unionTags(["base", "alpha"], ["beta"])).toEqual([
      "base",
      "alpha",
      "beta",
    ]);
    expect(unionTags(["base", "alpha"], ["alpha"])).toEqual(["base", "alpha"]);
    expect(unionTags(null, ["alpha"])).toEqual(["alpha"]);
  });
});
