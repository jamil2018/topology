import { describe, expect, it } from "vitest";
import {
  assertLinkedIssueProvider,
  isLinkedIssueProvider,
  issueProviderEnum,
  linkedIssueProviders,
} from "./schema";

describe("linked issue provider enum", () => {
  it("includes gitlab alongside the original providers", () => {
    expect(linkedIssueProviders).toEqual([
      "mock",
      "jira",
      "linear",
      "github",
      "gitlab",
    ]);
    expect(issueProviderEnum.enumValues).toContain("gitlab");
    expect(isLinkedIssueProvider("gitlab")).toBe(true);
    expect(assertLinkedIssueProvider("gitlab")).toBe("gitlab");
  });

  it("rejects unknown providers", () => {
    expect(isLinkedIssueProvider("acme")).toBe(false);
    expect(() => assertLinkedIssueProvider("acme")).toThrow(/acme/);
  });
});
