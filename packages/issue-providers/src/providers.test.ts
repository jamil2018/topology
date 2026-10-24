import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPersistedIssueProvider,
  buildFailureIssueBody,
  createGithubIssuesProvider,
  createGitlabIssuesProvider,
  createJiraProvider,
  createLinearProvider,
  createMockIssueProvider,
  mapGenericStatus,
  pickJiraTransitionId,
  pickLinearStateId,
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

describe("assertPersistedIssueProvider", () => {
  it("accepts hub-persisted ids including gitlab and rejects custom", () => {
    expect(assertPersistedIssueProvider("mock")).toBe("mock");
    expect(assertPersistedIssueProvider("gitlab")).toBe("gitlab");
    expect(() => assertPersistedIssueProvider("acme")).toThrow(/acme/);
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

  it("transitions an existing issue to done", async () => {
    const provider = createMockIssueProvider();
    const created = await provider.createIssue({
      title: "Fail",
      description: "details",
    });
    const closed = await provider.transition(created.key, { status: "done" });
    expect(closed.status).toBe("done");
    expect((await provider.getIssue(created.id)).status).toBe("done");
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

  it("picks a done-category transition and posts it", async () => {
    expect(
      pickJiraTransitionId(
        [
          { id: "11", name: "Start", to: { statusCategory: { key: "indeterminate" } } },
          { id: "21", name: "Done", to: { name: "Done", statusCategory: { key: "done" } } },
        ],
        "done",
      ),
    ).toBe("21");

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/transitions") && init?.method !== "POST") {
        return new Response(
          JSON.stringify({
            transitions: [
              { id: "21", name: "Done", to: { statusCategory: { key: "done" } } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.endsWith("/transitions") && init?.method === "POST") {
        return new Response(null, { status: 204 });
      }
      if (u.includes("/rest/api/3/issue/TOP-42")) {
        return new Response(
          JSON.stringify({
            id: "10001",
            key: "TOP-42",
            fields: {
              summary: "Login blank",
              status: { name: "Done", statusCategory: { key: "done" } },
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
      fetch: fetchMock as unknown as typeof fetch,
    });
    const closed = await provider.transition("TOP-42", { status: "done" });
    expect(closed.status).toBe("done");
    const posted = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/transitions") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(posted).toBeTruthy();
    expect(JSON.parse(String((posted?.[1] as RequestInit).body))).toEqual({
      transition: { id: "21" },
    });
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

  it("picks a completed workflow state on transition", async () => {
    expect(
      pickLinearStateId(
        [
          { id: "s-open", name: "Todo", type: "unstarted" },
          { id: "s-done", name: "Done", type: "completed" },
        ],
        "done",
      ),
    ).toBe("s-done");

    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (body.query.includes("issueUpdate")) {
        expect(body.variables.input).toEqual({ stateId: "s-done" });
        return new Response(
          JSON.stringify({
            data: {
              issueUpdate: {
                success: true,
                issue: {
                  id: "lin-1",
                  identifier: "TOP-9",
                  title: "Shard flake",
                  url: "https://linear.app/team/issue/TOP-9",
                  state: { name: "Done", type: "completed" },
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (body.query.includes("team { states")) {
        return new Response(
          JSON.stringify({
            data: {
              issue: {
                id: "lin-1",
                team: {
                  states: {
                    nodes: [
                      { id: "s-open", name: "Todo", type: "unstarted" },
                      { id: "s-done", name: "Done", type: "completed" },
                    ],
                  },
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
              state: { name: "Todo", type: "unstarted" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const provider = createLinearProvider({
      token: "lin_key",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const closed = await provider.transition("lin-1", { status: "done" });
    expect(closed.status).toBe("done");
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

  it("closes an issue via PATCH", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/issues/12") && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual({ state: "closed" });
        return new Response(
          JSON.stringify({
            id: 55,
            number: 12,
            title: "CI fail",
            html_url: "https://github.com/acme/app/issues/12",
            state: "closed",
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
    const closed = await provider.transition("12", { status: "done" });
    expect(closed.status).toBe("done");
  });
});

describe("gitlab issues provider (mocked HTTP)", () => {
  it("creates, fetches, and closes issues", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/issues") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: 99,
            iid: 7,
            title: "CI fail",
            web_url: "https://gitlab.com/acme/app/-/issues/7",
            state: "opened",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.includes("/issues/7") && init?.method === "PUT") {
        expect(JSON.parse(String(init.body))).toEqual({ state_event: "close" });
        return new Response(
          JSON.stringify({
            id: 99,
            iid: 7,
            title: "CI fail",
            web_url: "https://gitlab.com/acme/app/-/issues/7",
            state: "closed",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.includes("/issues/7")) {
        return new Response(
          JSON.stringify({
            id: 99,
            iid: 7,
            title: "CI fail",
            web_url: "https://gitlab.com/acme/app/-/issues/7",
            state: "opened",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("nope", { status: 404 });
    });

    const provider = createGitlabIssuesProvider({
      token: "glpat-x",
      defaultRepo: "acme/app",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const created = await provider.createIssue({
      title: "CI fail",
      description: "junit",
    });
    expect(created.key).toBe("#7");
    expect(created.provider).toBe("gitlab");

    const got = await provider.getIssue("7");
    expect(got.status).toBe("open");

    const closed = await provider.transition("#7", { status: "done" });
    expect(closed.status).toBe("done");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/projects/acme%2Fapp/issues",
    );
  });
});
