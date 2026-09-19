import { describe, expect, it } from "vitest";
import { validateProposalPayload } from "@topology/domain";
import { heuristicIntentFromRequirementTitle } from "./ai-draft";

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
});
