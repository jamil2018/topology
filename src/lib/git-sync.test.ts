import { describe, expect, it, vi } from "vitest";

/**
 * Unit-level coverage for resolveRunGitRefs branching without a live DB.
 * Integration coverage lives in affected.integration / ci paths.
 */

describe("resolveRunGitRefs empty short-circuit", () => {
  it("returns null refs when neither sha nor pr is provided", async () => {
    const { resolveRunGitRefs } = await import("./git-sync");

    const findFirst = vi.fn();
    const executor = {
      query: {
        repositories: { findFirst },
        commits: { findFirst: vi.fn() },
        pullRequests: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const result = await resolveRunGitRefs(
      { workspaceId: "ws-1" },
      executor as never,
    );

    expect(result).toEqual({
      repositoryId: null,
      commitId: null,
      pullRequestId: null,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns null refs when sha/pr given but no repository exists", async () => {
    const { resolveRunGitRefs } = await import("./git-sync");

    const findFirst = vi.fn().mockResolvedValue(null);
    const executor = {
      query: {
        repositories: { findFirst },
        commits: { findFirst: vi.fn() },
        pullRequests: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const result = await resolveRunGitRefs(
      { workspaceId: "ws-1", commitSha: "abc123", pr: 42 },
      executor as never,
    );

    expect(result).toEqual({
      repositoryId: null,
      commitId: null,
      pullRequestId: null,
    });
    expect(findFirst).toHaveBeenCalled();
  });
});
