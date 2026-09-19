import { describe, expect, it } from "vitest";
import {
  isProposalActorType,
  isProposalPayload,
  isProposalStatus,
  validateProposalPayload,
  type ProposalPayload,
} from "./proposal";

describe("validateProposalPayload", () => {
  const createIntent: ProposalPayload = {
    diffs: [
      {
        entityType: "intent",
        action: "create",
        before: null,
        after: {
          key: "AUTH-200",
          title: "Refund retry negative path",
          behavior: "Reject duplicate refund within 24h",
          criticality: "P0",
        },
      },
    ],
    rationale: "Requirement REQ-42 has no negative-path intent",
  };

  const updateRequirement: ProposalPayload = {
    diffs: [
      {
        entityType: "requirement",
        action: "update",
        entityId: "req-1",
        before: { title: "Refunds", criticality: "P1" },
        after: { title: "Refunds", criticality: "P0" },
      },
    ],
  };

  const linkEdge: ProposalPayload = {
    diffs: [
      {
        entityType: "edge",
        action: "link",
        before: null,
        after: {
          fromType: "requirement",
          fromId: "req-1",
          toType: "intent",
          toId: "intent-1",
          relation: "covers",
        },
      },
    ],
  };

  it("accepts a create proposal", () => {
    const result = validateProposalPayload(createIntent);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(createIntent);
    }
    expect(isProposalPayload(createIntent)).toBe(true);
  });

  it("accepts an update proposal", () => {
    const result = validateProposalPayload(updateRequirement);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.diffs[0]?.action).toBe("update");
    }
  });

  it("accepts a link proposal", () => {
    const result = validateProposalPayload(linkEdge);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.diffs[0]?.entityType).toBe("edge");
    }
  });

  it("accepts multiple diffs in one payload", () => {
    const multi: ProposalPayload = {
      diffs: [...createIntent.diffs, ...linkEdge.diffs],
      rationale: "Draft intent and link to requirement",
    };
    expect(validateProposalPayload(multi).ok).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(validateProposalPayload(null).ok).toBe(false);
    expect(validateProposalPayload("x").ok).toBe(false);
    expect(isProposalPayload({})).toBe(false);
  });

  it("rejects empty diffs without rationale", () => {
    const result = validateProposalPayload({ diffs: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path === "diffs")).toBe(true);
    }
  });

  it("accepts empty diffs when rationale explains impact", () => {
    const result = validateProposalPayload({
      diffs: [],
      rationale: "AUTH-021 may be stale: auth service paths changed.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.diffs).toEqual([]);
      expect(result.payload.rationale).toContain("AUTH-021");
    }
  });

  it("rejects unknown entityType and action", () => {
    const result = validateProposalPayload({
      diffs: [
        {
          entityType: "case",
          action: "delete",
          before: null,
          after: {},
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.includes("entityType"))).toBe(
        true,
      );
      expect(result.issues.some((i) => i.path.includes("action"))).toBe(true);
    }
  });

  it("rejects create with non-null before", () => {
    const result = validateProposalPayload({
      diffs: [
        {
          entityType: "intent",
          action: "create",
          before: { key: "X" },
          after: { key: "Y" },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.includes("before"))).toBe(true);
    }
  });

  it("rejects create with null after", () => {
    const result = validateProposalPayload({
      diffs: [
        {
          entityType: "intent",
          action: "create",
          before: null,
          after: null,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.includes("after"))).toBe(true);
    }
  });

  it("rejects update with null before or after", () => {
    const result = validateProposalPayload({
      diffs: [
        {
          entityType: "intent",
          action: "update",
          entityId: "i1",
          before: null,
          after: { title: "x" },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.includes("before"))).toBe(true);
    }
  });

  it("rejects bad rationale and entityId types", () => {
    const result = validateProposalPayload({
      diffs: [
        {
          entityType: "intent",
          action: "create",
          entityId: 42,
          before: null,
          after: { key: "A" },
        },
      ],
      rationale: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path === "rationale")).toBe(true);
      expect(result.issues.some((i) => i.path.includes("entityId"))).toBe(true);
    }
  });
});

describe("proposal status and actor helpers", () => {
  it("accepts known statuses", () => {
    expect(isProposalStatus("pending")).toBe(true);
    expect(isProposalStatus("accepted")).toBe(true);
    expect(isProposalStatus("rejected")).toBe(true);
    expect(isProposalStatus("draft")).toBe(false);
  });

  it("accepts known actor types", () => {
    expect(isProposalActorType("user")).toBe(true);
    expect(isProposalActorType("agent")).toBe(true);
    expect(isProposalActorType("model")).toBe(true);
    expect(isProposalActorType("system")).toBe(false);
  });
});
