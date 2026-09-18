import { describe, expect, it } from "vitest";
import {
  automationCaseKey,
  isUniqueViolation,
  missingShardIndices,
} from "./ci-ingest";

describe("automationCaseKey", () => {
  it("does not collide when keys only differ after 80 sanitized characters", () => {
    const shared = `BUGHUNTCI_${"A".repeat(70)}`;
    const passed = automationCaseKey(`${shared}PASS`);
    const failed = automationCaseKey(`${shared}DIFF`);

    expect(shared).toHaveLength(80);
    expect(passed).not.toBe(failed);
    expect(passed.startsWith("AUTO-")).toBe(true);
    expect(failed.startsWith("AUTO-")).toBe(true);
    expect(automationCaseKey(`${shared}PASS`)).toBe(passed);
  });

  it("keeps short keys stable", () => {
    expect(automationCaseKey("auth::login")).toBe("AUTO-auth::login");
    expect(automationCaseKey("AUTO-already")).toBe("AUTO-already");
  });
});

describe("missingShardIndices", () => {
  it("rejects a complete while any expected shard is absent", () => {
    expect(missingShardIndices([], 3)).toEqual([1, 2, 3]);
    expect(missingShardIndices([1], 4)).toEqual([2, 3, 4]);
    expect(missingShardIndices([2, 1], 2)).toEqual([]);
  });
});

describe("isUniqueViolation", () => {
  it("reads postgres 23505 from err.cause, not from the drizzle query text", () => {
    const wrapped = new Error("Failed query: insert into cases");
    (wrapped as Error & { cause?: unknown }).cause = Object.assign(
      new Error("duplicate key value violates unique constraint"),
      { code: "23505" },
    );
    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(new Error("Failed query: insert into cases"))).toBe(
      false,
    );
  });
});
