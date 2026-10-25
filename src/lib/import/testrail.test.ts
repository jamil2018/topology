import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyMapping } from "./mapping";
import { parseTestRail } from "./testrail";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "fixtures/import", name), "utf8");

describe("parseTestRail", () => {
  it("parses a suite XML export into cases with folder paths and steps", () => {
    const parsed = parseTestRail(fixture("testrail.xml"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.table.rows).toHaveLength(2);
    const { rows } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(rows.map((row) => row.key)).toEqual(["C1", "C2"]);
    expect(rows[0]).toMatchObject({
      title: "Successful login",
      folder: "Auth",
      priority: "P1",
      preconditions: "A user exists",
    });
    expect(rows[0]?.steps).toContain("Open /login");
    expect(rows[0]?.expectedResult).toContain("Login form is shown");
    expect(rows[1]?.folder).toBe("Auth / Recovery");
    expect(rows[1]?.steps).toContain("Open forgot password");
  });

  it("parses a CSV export using column aliases", () => {
    const parsed = parseTestRail(fixture("testrail.csv"));
    const { rows, errors } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "C10",
      title: "Checkout with saved card",
      folder: "Shop / Checkout",
      priority: "P0",
      tags: "checkout;payments",
    });
    expect(rows[0]?.steps).toContain("Click Pay");
  });

  it("parses an API JSON payload and resolves section paths", () => {
    const parsed = parseTestRail(fixture("testrail-api.json"));
    const { rows } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "C42",
      title: "Invite a teammate",
      folder: "Admin / Access",
      priority: "P1",
      preconditions: "Caller is an admin",
    });
    expect(rows[0]?.steps).toContain("Open Settings → Members");
    expect(rows[0]?.expectedResult).toContain("Invite is pending");
  });
});
