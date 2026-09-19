import { describe, expect, it } from "vitest";
import {
  computeFreshness,
  computeFreshnessDetail,
  freshnessLabel,
} from "./freshness";

describe("computeFreshness (Phase 1 compat)", () => {
  it("returns unverified when never executed", () => {
    expect(computeFreshness(null)).toBe("unverified");
    expect(computeFreshness(undefined)).toBe("unverified");
    expect(computeFreshness("")).toBe("unverified");
  });

  it("returns fresh when last execution exists and no mtimes given", () => {
    expect(computeFreshness(new Date())).toBe("fresh");
    expect(computeFreshness("2026-09-01T00:00:00.000Z")).toBe("fresh");
  });
});

describe("computeFreshness (Phase 3)", () => {
  const executed = "2026-09-01T00:00:00.000Z";
  const before = "2026-08-20T00:00:00.000Z";
  const after = "2026-09-05T00:00:00.000Z";

  it("returns stale when the entity itself changed after execution", () => {
    expect(
      computeFreshness({
        lastExecutedAt: executed,
        entityUpdatedAt: after,
        relatedUpdatedAt: before,
      }),
    ).toBe("stale");
  });

  it("returns potentially_stale when a related node changed after execution", () => {
    // AUTH-021: auth service changed after last execution
    expect(
      computeFreshness({
        lastExecutedAt: "2026-08-20T00:00:00.000Z",
        entityUpdatedAt: "2026-08-01T00:00:00.000Z",
        relatedUpdatedAt: "2026-09-15T00:00:00.000Z",
      }),
    ).toBe("potentially_stale");
  });

  it("returns fresh when execution is after all known changes", () => {
    expect(
      computeFreshness({
        lastExecutedAt: executed,
        entityUpdatedAt: before,
        relatedUpdatedAt: before,
      }),
    ).toBe("fresh");
  });

  it("prefers stale over potentially_stale when both apply", () => {
    expect(
      computeFreshness({
        lastExecutedAt: executed,
        entityUpdatedAt: after,
        relatedUpdatedAt: after,
      }),
    ).toBe("stale");
  });

  it("returns unverified for object input with no execution", () => {
    expect(
      computeFreshness({
        lastExecutedAt: null,
        entityUpdatedAt: after,
      }),
    ).toBe("unverified");
  });
});

describe("computeFreshnessDetail", () => {
  it("includes a reason for non-fresh states", () => {
    expect(
      computeFreshnessDetail({
        lastExecutedAt: null,
      }).reason,
    ).toMatch(/never executed/i);

    expect(
      computeFreshnessDetail({
        lastExecutedAt: "2026-09-01T00:00:00.000Z",
        entityUpdatedAt: "2026-09-10T00:00:00.000Z",
      }),
    ).toEqual({
      state: "stale",
      reason: "Entity changed after last execution",
    });

    expect(
      computeFreshnessDetail({
        lastExecutedAt: "2026-09-01T00:00:00.000Z",
        relatedUpdatedAt: "2026-09-10T00:00:00.000Z",
      }).state,
    ).toBe("potentially_stale");

    expect(
      computeFreshnessDetail({
        lastExecutedAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toEqual({ state: "fresh", reason: null });
  });
});

describe("freshnessLabel", () => {
  it("labels all states", () => {
    expect(freshnessLabel("fresh")).toBe("Fresh");
    expect(freshnessLabel("unverified")).toBe("Unverified");
    expect(freshnessLabel("potentially_stale")).toBe("Potentially stale");
    expect(freshnessLabel("stale")).toBe("Stale");
  });
});
