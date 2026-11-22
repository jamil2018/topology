import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { isAbortError } from "@/lib/abort";
import { render } from "@/test/render";
import { NotificationsBell } from "./notifications-bell";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Mirror browser fetch: reject with signal.reason (string reasons become overlay noise). */
function rejectionForSignal(signal?: AbortSignal) {
  if (signal?.reason !== undefined) return signal.reason;
  return Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
}

function abortAwareFetch(payload: unknown = { notifications: [], unreadCount: 0 }) {
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

describe("NotificationsBell abort cleanup", () => {
  it("swallows AbortError on unmount and does not set error state", async () => {
    const fetchMock = abortAwareFetch();
    vi.stubGlobal("fetch", fetchMock);
    const tracker = trackUnhandledRejections();

    const { unmount } = render(<NotificationsBell />);
    expect(screen.getByRole("button", { name: /Notifications/ })).toBeInTheDocument();

    await act(async () => {
      unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(tracker.rejections).toEqual([]);
    tracker.stop();
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

    const { unmount } = render(<NotificationsBell />);
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
      notifications: [
        {
          id: "n1",
          title: "Hello",
          body: "World",
          readAt: null,
          href: "/runs/1",
        },
      ],
      unreadCount: 1,
    });
    vi.stubGlobal("fetch", fetchMock);
    const tracker = trackUnhandledRejections();

    render(
      <StrictMode>
        <NotificationsBell />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /1 unread/ })).toBeInTheDocument();
    });

    expect(tracker.rejections).toEqual([]);
    tracker.stop();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still shows a real load failure after opening the panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "nope" }, 500)),
    );

    render(<NotificationsBell />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Notifications/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not load notifications. Try again.",
      );
    });
  });

  it("optimistically decrements unread when Open item is clicked", async () => {
    const fetchMock = abortAwareFetch({
      notifications: [
        {
          id: "n1",
          title: "Hello",
          body: "World",
          readAt: null,
          href: "/runs/1",
          openHref: "/api/notifications/n1/open",
        },
      ],
      unreadCount: 1,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationsBell />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /1 unread/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /1 unread/ }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Open item" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: "Open item" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Notifications$/ })).toBeInTheDocument();
    });
  });

  it("refreshes quietly when the tab becomes visible again", async () => {
    const fetchMock = abortAwareFetch({ notifications: [], unreadCount: 0 });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    render(<NotificationsBell />);

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    const afterMount = fetchMock.mock.calls.length;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(afterMount);
    });
  });
});
