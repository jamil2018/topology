import { describe, expect, it } from "vitest";
import { validateProposalPayload } from "@topology/domain";
import {
  findDuplicateIntentPairs,
  heuristicCaseSteps,
  heuristicIntentFromRequirementTitle,
  heuristicTriageSummary,
} from "./ai-draft";

describe("ai-draft heuristics", () => {
  it("builds a valid proposal payload from requirement title", () => {
    const payload = heuristicIntentFromRequirementTitle(
      "REQ-1",
      "User can sign in",
      "00000000-0000-4000-8000-000000000001",
    );
    const validated = validateProposalPayload(payload);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.payload.diffs.length).toBeGreaterThanOrEqual(2);
    expect(validated.payload.diffs[0]?.entityType).toBe("intent");
    expect(validated.payload.diffs[0]?.action).toBe("create");
    expect(validated.payload.rationale).toContain("REQ-1");
  });

  it("finds duplicate intent pairs by normalized title", () => {
    const pairs = findDuplicateIntentPairs([
      { id: "1", key: "A", title: "Account Lockout" },
      { id: "2", key: "B", title: "account  lockout" },
      { id: "3", key: "C", title: "Refund retry" },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.[0].key).toBe("A");
    expect(pairs[0]?.[1].key).toBe("B");
  });

  it("builds heuristic case steps from a title", () => {
    const steps = heuristicCaseSteps({
      title: "Checkout totals",
      description: "Apply a coupon and confirm tax",
    });
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0]?.action).toContain("Checkout totals");
    expect(steps.every((step) => step.action.trim().length > 0)).toBe(true);
  });

  it("builds a heuristic triage cluster summary", () => {
    const summary = heuristicTriageSummary({
      items: [
        {
          caseKey: "TOP-1",
          caseTitle: "Cart total",
          notes: "Expected 12 got 11",
          priority: "P0",
          reason: "assertion",
        },
        { caseKey: "TOP-1", caseTitle: "Cart total", notes: "retry fail" },
      ],
    });
    expect(summary).toContain("2 failures");
    expect(summary).toContain("TOP-1");
    expect(summary).toContain("Expected 12 got 11");
  });
});
