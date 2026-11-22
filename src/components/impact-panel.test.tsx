import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isAbortError } from "@/lib/abort";
import { render } from "@/test/render";
import { ACTION_CATALOG } from "@/lib/permissions";
import { ImpactPanel } from "./impact-panel";
import { ProjectActionsProvider } from "./project-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Mirror browser fetch: reject with signal.reason (string reasons become overlay noise). */
function rejectionForSignal(signal?: AbortSignal) {
  if (signal?.reason !== undefined) return signal.reason;
  return Object.assign(new Error("The operation was aborted."), {
    name: "AbortError",
  });
}

function abortAwareFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (signal?.aborted) return Promise.reject(rejectionForSignal(signal));
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(rejectionForSignal(signal));
      };
      signal?.addEventListener("abort", onAbort);
      setTimeout(() => {
        if (signal?.aborted) return;
        signal?.removeEventListener("abort", onAbort);
        resolve(jsonResponse({ repositories: [], pullRequests: [] }));
      }, 0);
    });
  });
}

function trackUnhandledRejections() {
  const rejections: unknown[] = [];
  const onUnhandled = (event: PromiseRejectionEvent) => {
    rejections.push(event.reason);
    event.preventDefault();
  };
  window.addEventListener("unhandledrejection", onUnhandled);
  return {
    rejections,
    stop() {
      window.removeEventListener("unhandledrejection", onUnhandled);
    },
  };
}

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

describe("ImpactPanel abort cleanup", () => {
  it("swallows AbortError on unmount and does not set error state", async () => {
    const fetchMock = abortAwareFetch();
    vi.stubGlobal("fetch", fetchMock);
    const tracker = trackUnhandledRejections();

    const { unmount } = render(<ImpactPanel />);

    await act(async () => {
      unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(tracker.rejections).toEqual([]);
    tracker.stop();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborts cleanup with an AbortError DOMException reason, not a string", async () => {
    const reasons: unknown[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        const onAbort = () => {
          reasons.push(signal?.reason);
          signal?.removeEventListener("abort", onAbort);
          reject(rejectionForSignal(signal));
        };
        signal?.addEventListener("abort", onAbort);
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const tracker = trackUnhandledRejections();

    const { unmount } = render(<ImpactPanel />);
    await act(async () => {
      unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(typeof reason).not.toBe("string");
      expect(isAbortError(reason)).toBe(true);
      expect((reason as DOMException).message).toBe("");
      expect((reason as DOMException).message).not.toMatch(/unmount/i);
    }
    expect(tracker.rejections).toEqual([]);
    tracker.stop();
  });

  it("does not surface AbortError under StrictMode remount", async () => {
    const fetchMock = abortAwareFetch();
    vi.stubGlobal("fetch", fetchMock);
    const tracker = trackUnhandledRejections();

    render(
      <StrictMode>
        <ImpactPanel />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(tracker.rejections).toEqual([]);
    tracker.stop();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
