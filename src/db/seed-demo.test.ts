import { describe, expect, it } from "vitest";
import { demoCatalog } from "./seed-demo";

describe("Harbor demo catalog", () => {
  it("ships about 150 cases across six suites", () => {
    const rows = demoCatalog();
    expect(rows).toHaveLength(150);
    const suites = new Set(rows.map((row) => row.suite));
    expect([...suites].sort()).toEqual([
      "Auth & account",
      "Cart",
      "Catalog & search",
      "Checkout & payments",
      "Orders & fulfillment",
      "Smoke",
    ]);
    expect(rows.every((row) => row.steps.length >= 3)).toBe(true);
  });
});
