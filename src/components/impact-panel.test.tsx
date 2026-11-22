import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/render";
import { ACTION_CATALOG } from "@/lib/permissions";
import { ImpactPanel } from "./impact-panel";
import { ProjectActionsProvider } from "./project-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function headerProjectId(init?: RequestInit): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get("x-topology-project-id");
  if (Array.isArray(headers)) {
    const hit = headers.find(
      ([key]) => key.toLowerCase() === "x-topology-project-id",
    );
    return hit?.[1] ?? null;
  }
  const record = headers as Record<string, string>;
  return (
    record["x-topology-project-id"] ??
    record["X-Topology-Project-Id"] ??
    null
  );
}

describe("ImpactPanel", () => {
  it("lets users pick a recent PR and links affected entities", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/repositories")) {
          return Response.json({
            repositories: [{ id: "repo-1", remoteUrl: "https://example/r" }],
          });
        }
        if (url.includes("/api/pull-requests")) {
          return Response.json({
            pullRequests: [
              {
                id: "pr-1",
                number: 42,
                title: "Fix cart totals",
                status: "open",
                head: "abc1234",
              },
            ],
          });
        }
        if (url.includes("/api/affected") && init?.method === "POST") {
          return Response.json({
            paths: ["src/cart.ts"],
            pathsSource: "pr",
            caseIds: ["case-1"],
            summary: {
              components: 1,
              requirements: 1,
              intents: 1,
              implementations: 0,
              gaps: 1,
              cases: 1,
            },
            impact: {
              intents: [{ id: "intent-1", key: "PAY-1", title: "Checkout" }],
              requirements: [
                { id: "req-1", key: "REQ-1", title: "Totals" },
              ],
              components: [
                { id: "comp-1", key: "cart", title: "Cart" },
              ],
              gaps: [
                {
                  kind: "affected_requirement_uncovered",
                  id: "req-1",
                  key: "REQ-1",
                  title: "Totals",
                },
              ],
            },
          });
        }
        return Response.json({ error: `unexpected ${url}` }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ImpactPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /#42/i })).toBeInTheDocument();
    });

    expect(headerProjectId(fetchMock.mock.calls[0]?.[1])).toBe("test-project");

    await user.click(screen.getByRole("button", { name: /#42/i }));
    expect(screen.getByPlaceholderText("42")).toHaveValue("42");
    expect(screen.getByPlaceholderText("abc1234")).toHaveValue("abc1234");

    await user.click(screen.getByRole("button", { name: /Analyze impact/i }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "PAY-1" })).toHaveAttribute(
        "href",
        "/intents?intent=intent-1",
      );
    });
    expect(screen.getByRole("link", { name: "REQ-1" })).toHaveAttribute(
      "href",
      "/requirements?requirement=req-1",
    );
    expect(
      screen.getByRole("link", { name: "Uncovered requirement" }),
    ).toHaveAttribute("href", "/requirements");

    const affectedCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).includes("/api/affected") && init?.method === "POST",
    );
    expect(headerProjectId(affectedCall?.[1])).toBe("test-project");
  });

  it("links to repository settings when none are connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/repositories")) {
          return Response.json({ repositories: [] });
        }
        if (url.includes("/api/pull-requests")) {
          return Response.json({ pullRequests: [] });
        }
        return Response.json({ error: `unexpected ${url}` }, { status: 500 });
      }),
    );

    render(<ImpactPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /Connect a repository/i }),
      ).toHaveAttribute(
        "href",
        "/settings?section=integrations#repositories",
      );
    });
  });

  it("resets and refetches when the active project changes", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const project = headerProjectId(init);
        if (url.includes("/api/repositories")) {
          return Response.json({
            repositories:
              project === "project-b"
                ? []
                : [{ id: "repo-1", remoteUrl: "https://example/r" }],
          });
        }
        if (url.includes("/api/pull-requests")) {
          return Response.json({
            pullRequests:
              project === "project-b"
                ? []
                : [
                    {
                      id: "pr-1",
                      number: 7,
                      title: "Old workspace PR",
                      status: "open",
                      head: "deadbeef",
                    },
                  ],
          });
        }
        return Response.json({ error: `unexpected ${url}` }, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    function Harness({ projectId }: { projectId: string }) {
      return (
        <ProjectActionsProvider
          actions={ACTION_CATALOG}
          projectId={projectId}
          userId="test-user"
        >
          <ImpactPanel />
        </ProjectActionsProvider>
      );
    }

    const { rerender } = render(<Harness projectId="project-a" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /#7/i })).toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => headerProjectId(init) === "project-a",
      ),
    ).toBe(true);

    rerender(<Harness projectId="project-b" />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /Connect a repository/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /#7/i })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => headerProjectId(init) === "project-b",
      ),
    ).toBe(true);
  });
});
