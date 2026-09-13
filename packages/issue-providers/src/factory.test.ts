import { afterEach, describe, expect, it } from "vitest";
import { listIssueProviders, resolveIssueProvider } from "./factory";
import { resetMockIssueStore } from "./mock";

afterEach(() => {
  resetMockIssueStore();
  delete process.env.TOPOLOGY_ISSUE_PROVIDER;
});

describe("resolveIssueProvider", () => {
  it("defaults to mock", () => {
    const provider = resolveIssueProvider();
    expect(provider.id).toBe("mock");
  });

  it("falls back to mock for unknown providers", () => {
    const provider = resolveIssueProvider({ provider: "unknown-vendor" });
    expect(provider.id).toBe("mock");
  });

  it("honors TOPOLOGY_ISSUE_PROVIDER=mock", () => {
    process.env.TOPOLOGY_ISSUE_PROVIDER = "mock";
    expect(resolveIssueProvider().id).toBe("mock");
  });

  it("lists supported providers", () => {
    expect(listIssueProviders()).toEqual([
      "mock",
      "jira",
      "linear",
      "github",
    ]);
  });
});
