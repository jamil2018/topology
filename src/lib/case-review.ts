export type CaseStatus =
  | "draft"
  | "in_review"
  | "ready"
  | "blocked"
  | "deprecated";

export type CaseReviewTransition =
  | { kind: "submit"; nextStatus: "in_review" }
  | { kind: "approve"; nextStatus: "ready" }
  | { kind: "request_changes"; nextStatus: "draft" }
  | { kind: "other"; nextStatus: CaseStatus }
  | { kind: "noop" };

/** Classify a status change for review workflow gates. */
export function classifyCaseStatusTransition(
  from: string,
  to: string | undefined,
): CaseReviewTransition {
  if (to === undefined || to === from) return { kind: "noop" };
  if (from === "draft" && to === "in_review") {
    return { kind: "submit", nextStatus: "in_review" };
  }
  if (from === "in_review" && to === "ready") {
    return { kind: "approve", nextStatus: "ready" };
  }
  if (from === "in_review" && to === "draft") {
    return { kind: "request_changes", nextStatus: "draft" };
  }
  return { kind: "other", nextStatus: to as CaseStatus };
}

export function validateCaseReviewTransition(input: {
  from: string;
  to: string | undefined;
  reviewerId?: string | null;
  reviewComment?: string | null;
}): { ok: true; transition: CaseReviewTransition } | { ok: false; error: string } {
  const transition = classifyCaseStatusTransition(input.from, input.to);
  if (transition.kind === "submit") {
    if (!input.reviewerId) {
      return {
        ok: false,
        error: "Reviewer is required when submitting a case for review",
      };
    }
    return { ok: true, transition };
  }
  if (transition.kind === "request_changes") {
    const comment = input.reviewComment?.trim() ?? "";
    if (!comment) {
      return {
        ok: false,
        error: "Review comment is required when requesting changes",
      };
    }
    return { ok: true, transition };
  }
  if (transition.kind === "other" && input.to === "in_review") {
    return {
      ok: false,
      error: "Only draft cases can be submitted for review",
    };
  }
  return { ok: true, transition };
}
