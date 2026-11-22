import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { isAbortError } from "@/lib/abort";
import { render } from "@/test/render";
import { RunProductivityActions } from "./run-productivity-actions";
import type { RunDetail } from "./run-executor-model";

const run: RunDetail = {
  id: "run-1",
  name: "Smoke",
  status: "completed",
  description: "desc",
  assigneeId: null,
  results: [],
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rejectionForSignal(signal?: AbortSignal | null) {
  if (signal?.reason !== undefined) return signal.reason;
  return Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
}

function abortAwareFetch(payload: unknown = { lineage: [] }) {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (signal?.aborted) return Promise.reject(rejectionForSignal(signal));
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(rejectionForSignal(signal));
      };
      signal?.addEventListener("abort", onAbort);
      // Defer so StrictMode cleanup can abort the first mount's request.
      setTimeout(() => {
        if (signal?.aborted) return;
        signal?.removeEventListener("abort", onAbort);
        resolve(jsonResponse(payload));
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
});

describe("RunProductivityActions abort cleanup", () => {
  it("swallows AbortError on unmount and does not set history error", async () => {
    const fetchMock = abortAwareFetch();
    vi.stubGlobal("fetch", fetchMock);
    const tracker = trackUnhandledRejections();

    const { unmount } = render(<RunProductivityActions run={run} />);
    expect(
      screen.getByRole("status", {
        name: "Loading retest history",
        hidden: true,
      }),
    ).toBeInTheDocument();

    await act(async () => {
      unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(tracker.rejections).toEqual([]);
    tracker.stop();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborts cleanup with an empty-message AbortError, not an unmount string", async () => {
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

    const { unmount } = render(<RunProductivityActions run={run} />);
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
    const fetchMock = abortAwareFetch({
      lineage: [
        {
          sourceId: "s1",
          sourceRunId: "r0",
          sourceName: "Prior",
          sourceStatus: "failed",
          resultId: "res1",
          runId: "run-1",
          name: "Smoke",
          status: "passed",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const tracker = trackUnhandledRejections();

    render(
      <StrictMode>
        <RunProductivityActions run={run} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Prior/)).toBeInTheDocument();
    });

    expect(tracker.rejections).toEqual([]);
    tracker.stop();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Retest history could not be loaded.")).not.toBeInTheDocument();
  });

  it("still shows a real load failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "nope" }, 500)),
    );

    render(<RunProductivityActions run={run} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Retest history could not be loaded.",
      );
    });
  });

  it("renders a styled template name field", async () => {
    vi.stubGlobal("fetch", abortAwareFetch());
    render(
      <RunProductivityActions
        run={{
          ...run,
          results: [
            {
              id: "r1",
              status: "passed",
              notes: "",
              assigneeId: null,
              linkedIssues: [],
              comments: [],
              attachments: [],
              case: {
                id: "c1",
                key: "SMOKE-1",
                title: "Loads",
                steps: "",
                expectedResult: "",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText("Template name")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("No retests linked to this run.")).toBeInTheDocument();
    });
  });
});
