import { describe, expect, it } from "vitest";
import {
  assertDemoSeedAllowed,
  seedIncludesDemoData,
  seedIncludesE2eData,
} from "./seed-guard";

describe("assertDemoSeedAllowed", () => {
  it("allows non-production without an override", () => {
    expect(() =>
      assertDemoSeedAllowed({ NODE_ENV: "development" }),
    ).not.toThrow();
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "test" })).not.toThrow();
  });

  it("refuses production unless TOPOLOGY_ALLOW_DEMO_SEED=1", () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "production" })).toThrow(
      /Refusing to run db:seed in production/,
    );
    expect(() =>
      assertDemoSeedAllowed({
        NODE_ENV: "production",
        TOPOLOGY_ALLOW_DEMO_SEED: "1",
      }),
    ).not.toThrow();
  });
});

describe("seedIncludesDemoData", () => {
  it("defaults to demo data and skips it in bootstrap mode", () => {
    expect(seedIncludesDemoData({})).toBe(true);
    expect(seedIncludesDemoData({ TOPOLOGY_SEED_MODE: "demo" })).toBe(true);
    expect(seedIncludesDemoData({ TOPOLOGY_SEED_MODE: "bootstrap" })).toBe(
      false,
    );
    expect(seedIncludesDemoData({ TOPOLOGY_SEED_MODE: "e2e" })).toBe(true);
  });
});

describe("seedIncludesE2eData", () => {
  it("is on only for TOPOLOGY_SEED_MODE=e2e", () => {
    expect(seedIncludesE2eData({})).toBe(false);
    expect(seedIncludesE2eData({ TOPOLOGY_SEED_MODE: "demo" })).toBe(false);
    expect(seedIncludesE2eData({ TOPOLOGY_SEED_MODE: "bootstrap" })).toBe(
      false,
    );
    expect(seedIncludesE2eData({ TOPOLOGY_SEED_MODE: "e2e" })).toBe(true);
  });
});
