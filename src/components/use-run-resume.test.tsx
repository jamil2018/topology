import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useRunResume } from "./use-run-resume";
import type { StatusFilter } from "./run-executor-model";

const key = "topology:run:user:project:run";
function useHarness(storageKey = key) {
  const [context, setContext] = useState({ focusedId: "first" as string | null, statusFilter: "all" as StatusFilter, query: "", mineOnly: false });
  useRunResume(storageKey, ["first", "second"], context, (saved) => setContext((current) => ({ ...current, ...saved })));
  return { context, setContext };
}
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), clear: () => values.clear() });
  window.history.replaceState(null, "", "/runs/run");
});
describe("run context continuity", () => {
  it("restores stored selection and filters", async () => {
    localStorage.setItem(key, JSON.stringify({ focusedId: "second", statusFilter: "failed", query: "checkout", mineOnly: true }));
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.context).toEqual({ focusedId: "second", statusFilter: "failed", query: "checkout", mineOnly: true }));
  });
  it("prioritizes explicit deep links and clears stale filters", async () => {
    localStorage.setItem(key, JSON.stringify({ focusedId: "first", statusFilter: "failed", query: "hidden", mineOnly: true }));
    window.history.replaceState(null, "", "/runs/run?result=second");
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.context).toEqual({ focusedId: "second", statusFilter: "all", query: "", mineOnly: false }));
  });
  it("falls back safely for malformed storage and deleted selections", () => {
    localStorage.setItem(key, "null");
    window.history.replaceState(null, "", "/runs/run?result=deleted");
    const { result } = renderHook(() => useHarness());
    expect(result.current.context.focusedId).toBe("first");
  });
  it("writes context to URL and restores a history entry", async () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.setContext((current) => ({ ...current, focusedId: "second", query: "payment" })));
    expect(new URLSearchParams(window.location.search).get("result")).toBe("second");
    act(() => { window.history.replaceState(null, "", "/runs/run?result=first&status=blocked&q=original&mine=1"); window.dispatchEvent(new PopStateEvent("popstate")); });
    await waitFor(() => expect(result.current.context).toEqual({ focusedId: "first", statusFilter: "blocked", query: "original", mineOnly: true }));
  });
  it("restores the initial selection when navigating Back from a later result", async () => {
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("result")).toBe("first"));
    act(() => result.current.setContext((current) => ({ ...current, focusedId: "second" })));
    act(() => window.history.back());
    await waitFor(() => expect(result.current.context.focusedId).toBe("first"));
  });
  it("isolates different projects and users", () => {
    localStorage.setItem(key, JSON.stringify({ focusedId: "second" }));
    const { result } = renderHook(() => useHarness("topology:run:other:other:run"));
    expect(result.current.context.focusedId).toBe("first");
  });
});
