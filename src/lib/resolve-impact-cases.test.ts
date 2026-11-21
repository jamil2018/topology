import { describe, expect, it } from "vitest";
import { collectCaseIdsForIntents } from "./resolve-impact-cases";

describe("collectCaseIdsForIntents", () => {
  it("returns empty when no intents", () => {
    expect(
      collectCaseIdsForIntents({
        intentIds: [],
        cases: [{ id: "c1", intentId: "i1" }],
        implementations: [{ intentId: "i1", caseId: "c2" }],
      }),
    ).toEqual([]);
  });

  it("collects cases linked via intentId and implementation.caseId", () => {
    const ids = collectCaseIdsForIntents({
      intentIds: ["i1", "i2"],
      cases: [
        { id: "c1", intentId: "i1" },
        { id: "c-other", intentId: "i9" },
        { id: "c2", intentId: null },
      ],
      implementations: [
        { intentId: "i2", caseId: "c3" },
        { intentId: "i1", caseId: "c1" },
        { intentId: "i2", caseId: null },
      ],
    });
    expect(ids.sort()).toEqual(["c1", "c3"]);
  });

  it("dedupes overlapping case links", () => {
    const ids = collectCaseIdsForIntents({
      intentIds: ["i1"],
      cases: [{ id: "c1", intentId: "i1" }],
      implementations: [{ intentId: "i1", caseId: "c1" }],
    });
    expect(ids).toEqual(["c1"]);
  });
});
