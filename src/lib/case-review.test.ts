import { describe, expect, it } from "vitest";
import {
  classifyCaseStatusTransition,
  validateCaseReviewTransition,
} from "./case-review";

describe("case review transitions", () => {
  it("classifies submit / approve / request_changes", () => {
    expect(classifyCaseStatusTransition("draft", "in_review")).toEqual({
      kind: "submit",
      nextStatus: "in_review",
    });
    expect(classifyCaseStatusTransition("in_review", "ready")).toEqual({
      kind: "approve",
      nextStatus: "ready",
    });
    expect(classifyCaseStatusTransition("in_review", "draft")).toEqual({
      kind: "request_changes",
      nextStatus: "draft",
    });
  });

  it("requires a reviewer on submit and a comment on request changes", () => {
    expect(
      validateCaseReviewTransition({
        from: "draft",
        to: "in_review",
      }).ok,
    ).toBe(false);
    expect(
      validateCaseReviewTransition({
        from: "draft",
        to: "in_review",
        reviewerId: "00000000-0000-4000-8000-000000000001",
      }).ok,
    ).toBe(true);
    expect(
      validateCaseReviewTransition({
        from: "in_review",
        to: "draft",
      }).ok,
    ).toBe(false);
    expect(
      validateCaseReviewTransition({
        from: "in_review",
        to: "draft",
        reviewComment: "Need clearer expected results",
      }).ok,
    ).toBe(true);
  });
});
