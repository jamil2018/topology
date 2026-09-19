import { describe, expect, it } from "vitest";
import {
  computeImpact,
  pathMatchesRule,
  type ImpactInput,
} from "./impact";

const fixture: ImpactInput = {
  changedPaths: ["src/auth/lockout.ts", "src/payments/refund.ts"],
  pathRules: [
    { pattern: "src/auth/", componentId: "c-auth" },
    { pattern: "src/payments/**", componentId: "c-pay" },
    { pattern: "src/unrelated/", componentId: "c-other" },
  ],
  components: [
    { id: "c-auth", key: "AUTH", title: "Auth service" },
    { id: "c-pay", key: "PAY", title: "Payments" },
    { id: "c-other", key: "OTHER", title: "Unrelated" },
    { id: "c-orphan", key: "ORPHAN", title: "Orphan component" },
  ],
  requirements: [
    { id: "r1", key: "REQ-LOCK", title: "Account lockout" },
    { id: "r2", key: "REQ-REFUND", title: "Refund retry" },
    { id: "r3", key: "REQ-BARE", title: "Bare requirement" },
  ],
  intents: [
    {
      id: "i1",
      key: "AUTH-021",
      title: "Account lockout",
      criticality: "P0",
    },
    {
      id: "i2",
      key: "PAY-010",
      title: "Refund retry",
      criticality: "P1",
    },
    {
      id: "i3",
      key: "PAY-011",
      title: "Refund happy path",
      criticality: "P2",
    },
  ],
  implementations: [
    {
      id: "impl-manual",
      intentId: "i1",
      type: "manual",
      sourcePath: null,
    },
    {
      id: "impl-junit",
      intentId: "i1",
      type: "junit",
      sourcePath: "tests/auth/lockout.spec.ts",
    },
    {
      id: "impl-pay-manual",
      intentId: "i2",
      type: "manual",
      sourcePath: null,
    },
    {
      id: "impl-direct",
      intentId: "i3",
      type: "playwright",
      sourcePath: "src/payments/refund.ts",
    },
  ],
  edges: [
    {
      fromType: "component",
      fromId: "c-auth",
      toType: "intent",
      toId: "i1",
      relation: "belongs_to",
    },
    {
      fromType: "intent",
      fromId: "i1",
      toType: "requirement",
      toId: "r1",
      relation: "covers",
    },
    {
      fromType: "component",
      fromId: "c-pay",
      toType: "intent",
      toId: "i2",
      relation: "belongs_to",
    },
    {
      fromType: "component",
      fromId: "c-pay",
      toType: "requirement",
      toId: "r2",
      relation: "belongs_to",
    },
    {
      fromType: "component",
      fromId: "c-pay",
      toType: "requirement",
      toId: "r3",
      relation: "belongs_to",
    },
    {
      fromType: "component",
      fromId: "c-orphan",
      toType: "requirement",
      toId: "r3",
      relation: "belongs_to",
    },
  ],
};

describe("pathMatchesRule", () => {
  it("matches path prefixes without false siblings", () => {
    expect(pathMatchesRule("src/auth/lockout.ts", "src/auth")).toBe(true);
    expect(pathMatchesRule("src/auth/lockout.ts", "src/auth/")).toBe(true);
    expect(pathMatchesRule("src/authenticate/x.ts", "src/auth")).toBe(false);
  });

  it("matches simple globs", () => {
    expect(pathMatchesRule("src/payments/refund.ts", "src/payments/**")).toBe(
      true,
    );
    expect(
      pathMatchesRule("src/payments/a/b.ts", "src/payments/**/*.ts"),
    ).toBe(true);
    expect(pathMatchesRule("src/other/x.ts", "src/payments/**")).toBe(false);
  });
});

describe("computeImpact", () => {
  it("walks path rules to components, intents, requirements, and implementations", () => {
    const report = computeImpact(fixture);

    expect(report.components.map((c) => c.key)).toEqual(["AUTH", "PAY"]);
    expect(report.intents.map((i) => i.key).sort()).toEqual([
      "AUTH-021",
      "PAY-010",
      "PAY-011",
    ]);
    expect(report.requirements.map((r) => r.key).sort()).toEqual([
      "REQ-BARE",
      "REQ-LOCK",
      "REQ-REFUND",
    ]);
    expect(report.implementations.map((i) => i.id).sort()).toEqual([
      "impl-direct",
      "impl-junit",
      "impl-manual",
      "impl-pay-manual",
    ]);
  });

  it("includes implementations whose sourcePath overlaps a changed path", () => {
    const report = computeImpact({
      ...fixture,
      changedPaths: ["src/payments/refund.ts"],
      pathRules: [],
    });
    expect(report.intents.map((i) => i.key)).toEqual(["PAY-011"]);
    expect(report.implementations.map((i) => i.id)).toEqual(["impl-direct"]);
  });

  it("emits simple gap hints for uncovered and manual-only impact", () => {
    const report = computeImpact({
      ...fixture,
      changedPaths: ["src/payments/refund.ts", "src/orphan/x.ts"],
      pathRules: [
        { pattern: "src/payments/", componentId: "c-pay" },
        { pattern: "src/orphan/", componentId: "c-orphan" },
      ],
    });

    expect(
      report.gaps.some(
        (g) => g.kind === "component_without_intents" && g.id === "c-orphan",
      ),
    ).toBe(true);
    expect(
      report.gaps.some(
        (g) => g.kind === "manual_only" && g.key === "PAY-010",
      ),
    ).toBe(true);
    expect(
      report.gaps.some(
        (g) =>
          g.kind === "affected_requirement_uncovered" && g.key === "REQ-BARE",
      ),
    ).toBe(true);
  });

  it("returns empty sets when nothing matches", () => {
    const report = computeImpact({
      ...fixture,
      changedPaths: ["docs/readme.md"],
    });
    expect(report.components).toEqual([]);
    expect(report.intents).toEqual([]);
    expect(report.requirements).toEqual([]);
    expect(report.implementations).toEqual([]);
    expect(report.gaps).toEqual([]);
  });
});
