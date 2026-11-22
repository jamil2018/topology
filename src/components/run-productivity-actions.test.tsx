import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
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

function abortError() {
  return Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
}

function abortAwareFetch(payload: unknown = { lineage: [] }) {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(abortError());
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
    expect(screen.getByText("Loading retest history…")).toBeInTheDocument();

    await act(async () => {
      unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(tracker.rejections).toEqual([]);
    tracker.stop();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
