import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/git-sync", () => ({
  getCommitBySha: vi.fn(),
  getPullRequestByNumber: vi.fn(),
  parseChangedPaths: (json: string) => {
    try {
      return JSON.parse(json) as string[];
    } catch {
      return [];
    }
  },
}));

describe("resolveAffectedPaths", () => {
  it("prefers explicit paths over commitSha", async () => {
    const { resolveAffectedPaths } = await import("./affected-resolve");
    const result = await resolveAffectedPaths("ws-1", {
      paths: ["src/a.ts"],
      commitSha: "abc",
    });
    expect(result).toEqual({
      ok: true,
      paths: ["src/a.ts"],
      pathsSource: "paths",
    });
  });

  it("loads paths from commit when no explicit paths", async () => {
    const gitSync = await import("@/lib/git-sync");
    vi.mocked(gitSync.getCommitBySha).mockResolvedValue({
      id: "c1",
      changedPathsJson: '["src/b.ts"]',
    } as never);

    const { resolveAffectedPaths } = await import("./affected-resolve");
    const result = await resolveAffectedPaths("ws-1", { commitSha: "deadbeef" });
    expect(result).toEqual({
      ok: true,
      paths: ["src/b.ts"],
      pathsSource: "commit",
    });
  });

  it("404 when commit missing", async () => {
    const gitSync = await import("@/lib/git-sync");
    vi.mocked(gitSync.getCommitBySha).mockResolvedValue(null);

    const { resolveAffectedPaths } = await import("./affected-resolve");
    const result = await resolveAffectedPaths("ws-1", { commitSha: "nope" });
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Commit not found",
    });
  });

  it("400 when commit has no stored paths", async () => {
    const gitSync = await import("@/lib/git-sync");
    vi.mocked(gitSync.getCommitBySha).mockResolvedValue({
      id: "c1",
      changedPathsJson: "[]",
    } as never);

    const { resolveAffectedPaths } = await import("./affected-resolve");
    const result = await resolveAffectedPaths("ws-1", { commitSha: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
