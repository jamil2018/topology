import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyMapping } from "./mapping";
import { parseQase } from "./qase";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "fixtures/import", name), "utf8");

describe("parseQase", () => {
  it("parses CSV including JSON-encoded steps", () => {
    const parsed = parseQase(fixture("qase.csv"));
    const { rows, errors } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "1",
      title: "Search products",
      folder: "Catalog",
      priority: "P1",
      status: "ready",
      tags: "search;smoke",
    });
    expect(rows[0]?.steps).toContain("Type a query");
    expect(rows[0]?.expectedResult).toContain("Results list renders");
  });

  it("parses API JSON entities and maps numeric priority/status", () => {
    const parsed = parseQase(fixture("qase.json"));
    const { rows } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "9",
      title: "Create a collection",
      folder: "Catalog / Collections",
      priority: "P1",
      status: "ready",
      tags: "merchant;catalog",
    });
    expect(rows[0]?.steps).toContain("Save a name");
    expect(rows[0]?.expectedResult).toContain("Collection appears in the list");
  });
});
