import { afterEach, describe, expect, it } from "vitest";
import { resetPluginRegistry } from "@topology/plugin-sdk";
import {
  listIssueProviders,
  registerIssueProvider,
  resolveIssueProvider,
} from "./factory";
import { resetMockIssueStore } from "./mock";
import type { IssueProvider, RemoteIssue } from "./types";

afterEach(() => {
  resetMockIssueStore();
  resetPluginRegistry();
  delete process.env.TOPOLOGY_ISSUE_PROVIDER;
});

function stubProvider(id: string): IssueProvider {
  const issue: RemoteIssue = {
    provider: id,
    id: "1",
    key: "A-1",
    url: "https://example.test/A-1",
    title: "filed",
    status: "open",
  };
  return {
    id,
    createIssue: async () => issue,
    getIssue: async () => issue,
    linkExisting: async () => issue,
    updateIssue: async () => ({ ...issue, status: "done" }),
    transition: async () => ({ ...issue, status: "done" }),
  };
}

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
      "gitlab",
    ]);
  });

  it("resolves a custom provider registered via the plugin SDK", () => {
    registerIssueProvider("acme", () => stubProvider("acme"));
    expect(resolveIssueProvider({ provider: "acme" }).id).toBe("acme");
    expect(resolveIssueProvider({ provider: "ACME" }).id).toBe("acme");
  });
});
