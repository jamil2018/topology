import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListPage, useQueryState } from "./use-list-page";
import type { PaginatedList } from "@/lib/list-pagination";

const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.current,
}));

beforeEach(() => {
  searchParams.current = new URLSearchParams();
  window.history.replaceState(null, "", "/cases");
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useQueryState", () => {
  it("writes immediately with pushState by default", () => {
    const { result } = renderHook(() =>
      useQueryState("status", "all", String),
    );
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    act(() => {
      result.current[1]("ready");
    });

    expect(result.current[0]).toBe("ready");
    expect(pushSpy).toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("status")).toBe(
      "ready",
    );
    expect(new URLSearchParams(window.location.search).has("page")).toBe(false);
  });

  it("debounces search q updates and uses replaceState", async () => {
    const { result } = renderHook(() =>
      useQueryState("q", "", String, { debounceMs: 200, replace: true }),
    );
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    vi.useFakeTimers();

    act(() => {
      result.current[1]("pay");
    });

    expect(result.current[0]).toBe("pay");
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("q")).toBe("pay");
  });

  it("pushes instead of replace when search clears page", async () => {
    window.history.replaceState(null, "", "/cases?page=2");
    const { result } = renderHook(() =>
      useQueryState("q", "", String, { debounceMs: 200, replace: true }),
    );
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    vi.useFakeTimers();

    act(() => {
      result.current[1]("checkout");
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(pushSpy).toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("q")).toBe("checkout");
    expect(params.has("page")).toBe(false);
  });

  it("coalesces rapid debounced updates to the latest value", async () => {
    const { result } = renderHook(() =>
      useQueryState("q", "", String, { debounceMs: 200, replace: true }),
    );
    vi.useFakeTimers();

    act(() => {
      result.current[1]("a");
      result.current[1]("ab");
      result.current[1]("abc");
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current[0]).toBe("abc");
    expect(new URLSearchParams(window.location.search).get("q")).toBe("abc");
  });

  it("hydrates from the current search params", async () => {
    window.history.replaceState(null, "", "/cases?q=smoke");
    searchParams.current = new URLSearchParams("q=smoke");

    const { result } = renderHook(() =>
      useQueryState("q", "", String, { debounceMs: 200, replace: true }),
    );

    await waitFor(() => {
      expect(result.current[0]).toBe("smoke");
    });
  });
});

describe("useListPage", () => {
  const initial: PaginatedList<{ id: string }> = {
    items: [{ id: "1" }],
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1,
    nextCursor: null,
  };

  function mockFetchOk(items: { id: string }[] = [{ id: "2" }]) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ cases: items, page: 1, pageSize: 50, total: items.length, totalPages: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it("does not fetch on mount when initial data matches the query", async () => {
    const fetchSpy = mockFetchOk();
    vi.useFakeTimers();

    renderHook(() =>
      useListPage("/api/cases", "folder=all&page=1", initial, "cases"),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fetch on StrictMode remount when initial data matches", async () => {
    const fetchSpy = mockFetchOk();
    vi.useFakeTimers();

    renderHook(
      () => useListPage("/api/cases", "folder=all&page=1", initial, "cases"),
      { wrapper: StrictMode },
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches once when the query changes (folder filter)", async () => {
    const fetchSpy = mockFetchOk([{ id: "f1" }]);
    vi.useFakeTimers();

    const { rerender, result } = renderHook(
      ({ query }) => useListPage("/api/cases", query, initial, "cases"),
      { initialProps: { query: "folder=all&page=1" } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    rerender({ query: "folder=abc&page=1" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/cases?folder=abc&page=1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.data?.items).toEqual([{ id: "f1" }]);
    expect(result.current.loading).toBe(false);
  });

  it("coalesces rapid query changes to a single applied request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        await new Promise<void>((resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            resolve();
            return;
          }
          if (signal.aborted) {
            reject(signal.reason ?? new DOMException("aborted", "AbortError"));
            return;
          }
          const onAbort = () => {
            reject(signal.reason ?? new DOMException("aborted", "AbortError"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
          window.setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, 50);
        });
        const url = String(input);
        const id = url.includes("folder=z") ? "z" : "mid";
        return new Response(
          JSON.stringify({
            cases: [{ id }],
            page: 1,
            pageSize: 50,
            total: 1,
            totalPages: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    vi.useFakeTimers();

    const { rerender, result } = renderHook(
      ({ query }) => useListPage("/api/cases", query, initial, "cases"),
      { initialProps: { query: "folder=all" } },
    );

    rerender({ query: "folder=a" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    rerender({ query: "folder=z" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result.current.data?.items).toEqual([{ id: "z" }]);
    expect(result.current.loading).toBe(false);
    // First scheduled fetch aborted before start; only the latest query runs.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/cases?folder=z");
  });

  it("retry refetches the bootstrap query once", async () => {
    const fetchSpy = mockFetchOk([{ id: "retry" }]);
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useListPage("/api/cases", "folder=all", initial, "cases"),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => {
      result.current.retry();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.data?.items).toEqual([{ id: "retry" }]);
  });

  it("does not fetch when initial is undefined (local-only mode)", async () => {
    const fetchSpy = mockFetchOk();
    vi.useFakeTimers();

    renderHook(() =>
      useListPage("/api/cases", "folder=all", undefined, "cases"),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
