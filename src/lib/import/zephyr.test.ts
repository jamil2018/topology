import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyMapping } from "./mapping";
import { parseZephyr } from "./zephyr";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "fixtures/import", name), "utf8");

describe("parseZephyr", () => {
  it("collapses step-by-step CSV rows into one case", () => {
    const parsed = parseZephyr(fixture("zephyr.csv"));
    const { rows, errors } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "PROJ-T1",
      title: "Login with SSO",
      folder: "Auth",
      priority: "P1",
      status: "ready",
      tags: "sso;smoke",
    });
    expect(rows[0]?.steps.split("\n")).toHaveLength(3);
    expect(rows[0]?.expectedResult).toContain("Hub loads");
    expect(rows[1]?.key).toBe("PROJ-T2");
    expect(rows[1]?.title).toBe("Logout");
  });

  it("parses Zephyr Scale API JSON", () => {
    const parsed = parseZephyr(fixture("zephyr.json"));
    const { rows } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "PROJ-T9",
      title: "Expire idle session",
      folder: "Auth / Session",
      priority: "P2",
      status: "draft",
    });
    expect(rows[0]?.steps).toContain("Wait past idle timeout");
    expect(rows[0]?.expectedResult).toContain("Login screen is shown");
  });
});
