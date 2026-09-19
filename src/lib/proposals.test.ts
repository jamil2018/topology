import { afterEach, describe, expect, it } from "vitest";
import {
  getAiProvider,
  isAiProviderEnabled,
  parseInputRefs,
  parseProposalPayload,
} from "./proposals";

describe("proposals helpers", () => {
  const prev = process.env.TOPOLOGY_AI_PROVIDER;

  afterEach(() => {
    if (prev === undefined) delete process.env.TOPOLOGY_AI_PROVIDER;
    else process.env.TOPOLOGY_AI_PROVIDER = prev;
  });

  it("defaults AI provider to none", () => {
    delete process.env.TOPOLOGY_AI_PROVIDER;
    expect(getAiProvider()).toBe("none");
    expect(isAiProviderEnabled()).toBe(false);
  });

  it("treats configured providers as enabled", () => {
    process.env.TOPOLOGY_AI_PROVIDER = "openai";
    expect(getAiProvider()).toBe("openai");
    expect(isAiProviderEnabled()).toBe(true);
  });

  it("parses input refs from JSON or CSV", () => {
    expect(parseInputRefs(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    expect(parseInputRefs("req-1, req-2")).toEqual(["req-1", "req-2"]);
    expect(parseInputRefs(null)).toEqual([]);
  });

  it("parses and validates proposal payload JSON", () => {
    const payload = {
      diffs: [
        {
          entityType: "intent",
          action: "create",
          before: null,
          after: { key: "AUTH-1", title: "Lockout" },
        },
      ],
      rationale: "gap",
    };
    expect(parseProposalPayload(JSON.stringify(payload))).toEqual(payload);
    expect(() => parseProposalPayload("{")).toThrow(/Invalid proposal payload/);
    expect(() => parseProposalPayload(JSON.stringify({ diffs: [] }))).toThrow();
  });
});
