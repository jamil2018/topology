"use client";

import { useEffect, useRef } from "react";
import type { StatusFilter } from "./run-executor-model";

type Context = { focusedId: string | null; statusFilter: StatusFilter; mineOnly: boolean; query: string };
const fingerprint = (value: Context) => JSON.stringify([value.focusedId, value.statusFilter, value.mineOnly, value.query]);

/** URL history wins over browser persistence; storage is isolated by user/project/run. */
export function useRunResume(key: string, resultIds: string[], context: Context, restore: (context: Partial<Context>) => void) {
  const latest = useRef({ context, restore, resultIds });
  const restoring = useRef<string | null>(null);
  const previous = useRef<string | null>(null);
  useEffect(() => { latest.current = { context, restore, resultIds }; });
  useEffect(() => {
    const fallback = latest.current.context.focusedId;
    const load = () => {
      let saved: Partial<Context> = {};
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed;
      } catch { /* Persistence is optional. */ }
      const params = new URLSearchParams(window.location.search);
      const explicit = params.get("result");
      const candidate = explicit ?? saved.focusedId;
      const status = params.get("status") ?? (explicit ? "all" : saved.statusFilter);
      const next: Context = {
        focusedId: candidate && latest.current.resultIds.includes(candidate) ? candidate : fallback,
        statusFilter: ["all", "untested", "failed", "blocked"].includes(status ?? "") ? status as StatusFilter : "all",
        query: params.get("q") ?? (!explicit && typeof saved.query === "string" ? saved.query : ""),
        mineOnly: params.has("mine") ? params.get("mine") === "1" : !explicit && saved.mineOnly === true,
      };
      // Give the initial entry its own context so Back cannot read newer storage.
      const url = new URL(window.location.href);
      if (next.focusedId) url.searchParams.set("result", next.focusedId);
      url.searchParams.set("status", next.statusFilter);
      if (next.query) url.searchParams.set("q", next.query); else url.searchParams.delete("q");
      if (next.mineOnly) url.searchParams.set("mine", "1"); else url.searchParams.delete("mine");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      restoring.current = fingerprint(next);
      previous.current = restoring.current;
      latest.current.restore(next);
    };
    load();
    window.addEventListener("popstate", load);
    return () => { window.removeEventListener("popstate", load); previous.current = null; };
  }, [key]);
  useEffect(() => {
    const current = fingerprint(context);
    if (restoring.current) {
      if (restoring.current !== current) return;
      restoring.current = null;
    }
    try { localStorage.setItem(key, JSON.stringify(context)); } catch { /* Persistence is optional. */ }
    if (previous.current !== null && previous.current !== current) {
      const url = new URL(window.location.href);
      if (context.focusedId) url.searchParams.set("result", context.focusedId); else url.searchParams.delete("result");
      url.searchParams.set("status", context.statusFilter);
      if (context.query) url.searchParams.set("q", context.query); else url.searchParams.delete("q");
      if (context.mineOnly) url.searchParams.set("mine", "1"); else url.searchParams.delete("mine");
      window.history.pushState(null, "", url.pathname + url.search + url.hash);
    }
    previous.current = current;
  }, [key, context.focusedId, context.statusFilter, context.mineOnly, context.query]);
}
