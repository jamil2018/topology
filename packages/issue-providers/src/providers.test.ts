import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFailureIssueBody,
  createGithubIssuesProvider,
  createJiraProvider,
  createLinearProvider,
  createMockIssueProvider,
  mapGenericStatus,
  resetMockIssueStore,
  setMockIssueStatus,
} from "./index";

afterEach(() => {
  resetMockIssueStore();
  vi.restoreAllMocks();
});

describe("mapGenericStatus", () => {
  it("maps closed-like and progress statuses", () => {
    expect(mapGenericStatus("Closed")).toBe("done");
    expect(mapGenericStatus("In Progress")).toBe("in_progress");
    expect(mapGenericStatus("To Do")).toBe("open");
  });
});

describe("buildFailureIssueBody", () => {
  it("includes case and run context", () => {
    const body = buildFailureIssueBody({
      caseKey: "TOP-1",
      caseTitle: "Hub loads",
      resultStatus: "failed",
      notes: "blank screen",
      runName: "Smoke",
      runId: "run-1",
    });
    expect(body).toContain("TOP-1");
    expect(body).toContain("blank screen");
    expect(body).toContain("Smoke");
  });
});

describe("mock provider", () => {
  it("creates and closes issues", async () => {
    const provider = createMockIssueProvider();
    const created = await provider.createIssue({
      title: "Fail",
      description: "details",
    });
    expect(created.key).toMatch(/^MOCK-/);
    expect(created.status).toBe("open");

    setMockIssueStatus(created.key, "done");
    const refreshed = await provider.getIssue(created.key);
    expect(refreshed.status).toBe("done");
  });
});

describe("jira provider (mocked HTTP)", () => {
  it("creates and fetches issues", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/rest/api/3/issue") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "10001", key: "TOP-42", self: u }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/rest/api/3/issue/TOP-42")) {
        return new Response(
          JSON.stringify({
            id: "10001",
            key: "TOP-42",
            self: u,
            fields: {
              summary: "Login blank",
              status: {
                name: "In Progress",
                statusCategory: { key: "indeterminate" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const provider = createJiraProvider({
      baseUrl: "https://example.atlassian.net",
      email: "qe@example.com",
      token: "token",
      defaultProjectKey: "TOP",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const created = await provider.createIssue({
      title: "Login blank",
      description: "repro",
      projectKey: "TOP",
    });
    expect(created.key).toBe("TOP-42");
    expect(created.url).toContain("/browse/TOP-42");

    const got = await provider.getIssue("TOP-42");
    expect(got.status).toBe("in_progress");
    expect(got.title).toBe("Login blank");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("linear provider (mocked HTTP)", () => {
  it("creates and fetches issues via GraphQL", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (body.query.includes("issueCreate")) {
        return new Response(
          JSON.stringify({
            data: {
              issueCreate: {
                success: true,
                issue: {
                  id: "lin-1",
                  identifier: "TOP-9",
                  title: "Shard flake",
                  url: "https://linear.app/team/issue/TOP-9",
                  state: { name: "Todo", type: "unstarted" },
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            issue: {
              id: "lin-1",
              identifier: "TOP-9",
              title: "Shard flake",
              url: "https://linear.app/team/issue/TOP-9",
              state: { name: "Done", type: "completed" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const provider = createLinearProvider({
      token: "lin_key",
      defaultTeamId: "team-1",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const created = await provider.createIssue({
      title: "Shard flake",
      description: "intermittent",
    });
    expect(created.key).toBe("TOP-9");
    expect(created.status).toBe("open");

    const got = await provider.getIssue("lin-1");
    expect(got.status).toBe("done");
  });
});

describe("github issues provider (mocked HTTP)", () => {
  it("creates and fetches issues", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/issues") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: 55,
            number: 12,
            title: "CI fail",
            html_url: "https://github.com/acme/app/issues/12",
            state: "open",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.endsWith("/issues/12")) {
        return new Response(
          JSON.stringify({
            id: 55,
            number: 12,
            title: "CI fail",
            html_url: "https://github.com/acme/app/issues/12",
            state: "closed",
            state_reason: "completed",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("nope", { status: 404 });
    });

    const provider = createGithubIssuesProvider({
      token: "ghp_x",
      defaultRepo: "acme/app",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const created = await provider.createIssue({
      title: "CI fail",
      description: "junit",
    });
    expect(created.key).toBe("#12");

    const got = await provider.linkExisting("12");
    expect(got.status).toBe("done");
  });
});
