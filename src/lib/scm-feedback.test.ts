import { describe, expect, it, vi } from "vitest";
import {
  SCM_CHECK_NAME,
  SCM_FEEDBACK_MARKER,
  createGithubScmFeedbackClient,
  createGitlabScmFeedbackClient,
  formatScmCheckTitle,
  formatScmPrCommentBody,
  parseScmRepoSlug,
  publishPreparedScmFeedback,
  scmCheckConclusion,
  signaturesFromResults,
  summarizeRunResults,
  type ScmFeedbackPayload,
  type ScmFeedbackClient,
} from "./scm-feedback";

function samplePayload(
  overrides: Partial<ScmFeedbackPayload> = {},
): ScmFeedbackPayload {
  return {
    runId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    runName: "PR smoke",
    commitSha: "abc1234deadbeef",
    prNumber: 42,
    summary: {
      passed: 8,
      failed: 1,
      blocked: 0,
      skipped: 0,
      untested: 0,
      flake: 1,
      total: 9,
    },
    signatures: [
      { hash: "deadbeef", message: "timeout after <n>ms", count: 2 },
    ],
    gaps: [
      {
        key: "REQ-1",
        title: "Checkout tax",
        kind: "affected_requirement_uncovered",
      },
    ],
    readiness: {
      milestoneName: "1.4",
      status: "at_risk",
      badge: "At risk",
    },
    runUrl: "http://localhost/runs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    reportUrl:
      "http://localhost/reports?run=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    ...overrides,
  };
}

describe("parseScmRepoSlug", () => {
  it("parses https and ssh remotes", () => {
    expect(parseScmRepoSlug("https://github.com/acme/app.git")).toBe(
      "acme/app",
    );
    expect(parseScmRepoSlug("git@github.com:acme/app.git")).toBe("acme/app");
    expect(parseScmRepoSlug("https://gitlab.com/group/sub/project.git")).toBe(
      "group/sub/project",
    );
  });

  it("rejects invalid remotes", () => {
    expect(parseScmRepoSlug("")).toBeNull();
    expect(parseScmRepoSlug("not-a-url")).toBeNull();
  });
});

describe("summarize + conclusion + signatures", () => {
  it("summarizes result statuses", () => {
    expect(
      summarizeRunResults(
        [
          { status: "passed" },
          { status: "passed" },
          { status: "failed" },
          { status: "blocked" },
          { status: "skipped" },
          { status: "untested" },
        ],
        1,
      ),
    ).toEqual({
      passed: 2,
      failed: 1,
      blocked: 1,
      skipped: 1,
      untested: 1,
      flake: 1,
      total: 6,
    });
  });

  it("maps fail / readiness into check conclusions", () => {
    const summary = summarizeRunResults([{ status: "passed" }]);
    expect(scmCheckConclusion(summary, null)).toBe("success");
    expect(
      scmCheckConclusion(summarizeRunResults([{ status: "failed" }]), null),
    ).toBe("failure");
    expect(
      scmCheckConclusion(summary, {
        milestoneName: "M",
        status: "at_risk",
        badge: "At risk",
      }),
    ).toBe("neutral");
    expect(
      scmCheckConclusion(summary, {
        milestoneName: "M",
        status: "no_go",
        badge: "No-Go",
      }),
    ).toBe("failure");
  });

  it("clusters failure signatures", () => {
    const sigs = signaturesFromResults([
      { status: "failed", errorMessage: "Timeout after 9000ms" },
      { status: "failed", errorMessage: "Timeout after 12000ms" },
      { status: "passed", errorMessage: "ignored" },
    ]);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]?.count).toBe(2);
    expect(sigs[0]?.message).toMatch(/timeout/i);
  });
});

describe("comment + check formatting", () => {
  it("includes sticky marker, counts, gaps, and deep links", () => {
    const body = formatScmPrCommentBody(samplePayload());
    expect(body.startsWith(SCM_FEEDBACK_MARKER)).toBe(true);
    expect(body).toContain("Failed: **1**");
    expect(body).toContain("Flake: **1**");
    expect(body).toContain("deadbeef");
    expect(body).toContain("REQ-1");
    expect(body).toContain("/runs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(formatScmCheckTitle(samplePayload().summary, samplePayload().readiness)).toContain(
      "milestone At risk",
    );
  });
});

describe("publishPreparedScmFeedback", () => {
  it("skips when toggles are off", async () => {
    const result = await publishPreparedScmFeedback({
      repository: {
        id: "r1",
        provider: "github",
        remoteUrl: "https://github.com/acme/app.git",
        postPrStatusChecks: false,
        postPrSummaryComment: false,
      },
      payload: samplePayload(),
      client: {
        upsertCheckRun: vi.fn(),
        upsertStickyComment: vi.fn(),
      },
    });
    expect(result).toEqual({ skipped: true, reason: "toggles_disabled" });
  });

  it("posts check run and sticky comment via injected client", async () => {
    const client: ScmFeedbackClient = {
      upsertCheckRun: vi.fn(async () => ({ id: "check-1" })),
      upsertStickyComment: vi.fn(async () => ({ id: "comment-1" })),
    };
    const result = await publishPreparedScmFeedback({
      repository: {
        id: "r1",
        provider: "github",
        remoteUrl: "https://github.com/acme/app.git",
        postPrStatusChecks: true,
        postPrSummaryComment: true,
      },
      payload: samplePayload(),
      client,
    });
    expect(result).toEqual({
      skipped: false,
      checkRunId: "check-1",
      commentId: "comment-1",
    });
    expect(client.upsertCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        repoSlug: "acme/app",
        headSha: "abc1234deadbeef",
        externalId: "topology-run-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }),
    );
    expect(client.upsertStickyComment).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        body: expect.stringContaining(SCM_FEEDBACK_MARKER),
      }),
    );
  });
});

describe("GitHub SCM client (mocked HTTP)", () => {
  it("creates a check run and sticky PR comment", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("/commits/") && u.includes("/check-runs") && method === "GET") {
        return new Response(JSON.stringify({ check_runs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.endsWith("/check-runs") && method === "POST") {
        const body = JSON.parse(String(init?.body)) as {
          name: string;
          conclusion: string;
        };
        expect(body.name).toBe(SCM_CHECK_NAME);
        expect(body.conclusion).toBe("failure");
        return new Response(JSON.stringify({ id: 101 }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/issues/42/comments") && method === "GET") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.endsWith("/issues/42/comments") && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { body: string };
        expect(body.body).toContain(SCM_FEEDBACK_MARKER);
        return new Response(JSON.stringify({ id: 202 }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(`unexpected ${method} ${u}`, { status: 404 });
    });

    const client = createGithubScmFeedbackClient({
      token: "ghp_test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const check = await client.upsertCheckRun({
      repoSlug: "acme/app",
      headSha: "abc1234",
      conclusion: "failure",
      title: "1 failed",
      summaryMarkdown: "fail",
      detailsUrl: "http://localhost/runs/1",
      externalId: "topology-run-1",
    });
    expect(check.id).toBe("101");

    const comment = await client.upsertStickyComment({
      repoSlug: "acme/app",
      prNumber: 42,
      body: `${SCM_FEEDBACK_MARKER}\nhello`,
    });
    expect(comment.id).toBe("202");
  });

  it("updates an existing sticky comment", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("/issues/7/comments") && method === "GET") {
        return new Response(
          JSON.stringify([
            { id: 9, body: `${SCM_FEEDBACK_MARKER}\nold` },
            { id: 10, body: "unrelated" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.endsWith("/issues/comments/9") && method === "PATCH") {
        return new Response(JSON.stringify({ id: 9 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(`unexpected ${method} ${u}`, { status: 404 });
    });

    const client = createGithubScmFeedbackClient({
      token: "ghp_test",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const updated = await client.upsertStickyComment({
      repoSlug: "acme/app",
      prNumber: 7,
      body: `${SCM_FEEDBACK_MARKER}\nnew`,
    });
    expect(updated.id).toBe("9");
  });
});

describe("GitLab SCM client (mocked HTTP)", () => {
  it("posts commit status and MR note", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("/statuses/") && method === "POST") {
        const body = JSON.parse(String(init?.body)) as {
          state: string;
          name: string;
        };
        expect(body.state).toBe("success");
        expect(body.name).toBe(SCM_CHECK_NAME);
        return new Response(JSON.stringify({ id: 55 }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/merge_requests/3/notes") && method === "GET") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.endsWith("/merge_requests/3/notes") && method === "POST") {
        return new Response(JSON.stringify({ id: 66 }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(`unexpected ${method} ${u}`, { status: 404 });
    });

    const client = createGitlabScmFeedbackClient({
      token: "glpat_test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const status = await client.upsertCheckRun({
      repoSlug: "group/project",
      headSha: "deadbeef",
      conclusion: "success",
      title: "all green",
      summaryMarkdown: "ok",
      detailsUrl: "http://localhost/runs/1",
      externalId: "topology-run-1",
    });
    expect(status.id).toBe("55");

    const note = await client.upsertStickyComment({
      repoSlug: "group/project",
      prNumber: 3,
      body: `${SCM_FEEDBACK_MARKER}\nmr note`,
    });
    expect(note.id).toBe("66");
  });
});
