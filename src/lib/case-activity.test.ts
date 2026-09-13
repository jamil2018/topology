import { describe, expect, it } from "vitest";
import { describeCaseChange } from "./case-activity-format";
import {
  caseViewConfigSchema,
  parseCaseViewConfig,
  parseRunViewConfig,
  runViewConfigSchema,
  serializeCaseViewConfig,
} from "./saved-views";

describe("describeCaseChange", () => {
  it("formats field transitions", () => {
    expect(describeCaseChange("status", "draft", "ready")).toBe(
      "Status draft → ready",
    );
    expect(describeCaseChange("folderId", "Smoke", "unfiled")).toBe(
      "Moved folder Smoke → unfiled",
    );
    expect(describeCaseChange("tags", ["a"], ["a", "b"])).toBe(
      "Tags a → a, b",
    );
  });
});

describe("saved view config", () => {
  it("round-trips case view config and falls back safely", () => {
    const raw = serializeCaseViewConfig({
      folderFilter: "abc",
      search: "login",
      statusFilter: "ready",
      priorityFilter: "P0",
      sort: "priority",
      sortDir: "desc",
    });
    expect(parseCaseViewConfig(raw)).toMatchObject({
      folderFilter: "abc",
      search: "login",
      statusFilter: "ready",
      sort: "priority",
      sortDir: "desc",
    });
    expect(parseCaseViewConfig("not-json").folderFilter).toBe("all");
  });

  it("parses run view config defaults", () => {
    expect(parseRunViewConfig("{}")).toEqual({
      search: "",
      sort: "updated",
    });
  });

  it("accepts cases and runs create payloads via entity-discriminated schemas", () => {
    const casesOk = caseViewConfigSchema.safeParse({
      folderFilter: "all",
      search: "",
      statusFilter: "all",
      priorityFilter: "all",
      sort: "key",
      sortDir: "asc",
    });
    expect(casesOk.success).toBe(true);

    const runsOk = runViewConfigSchema.safeParse({
      search: "nightly",
      sort: "created",
    });
    expect(runsOk.success).toBe(true);
  });
});
