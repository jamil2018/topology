"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { abortCleanup, isAbortError } from "@/lib/abort";
import type { PaginatedList } from "@/lib/list-pagination";

export type QueryStateOptions = {
  resetPage?: boolean;
  /** Debounce history writes (local state still updates immediately). */
  debounceMs?: number;
  /** Use replaceState instead of pushState (typical for text search `q`). */
  replace?: boolean;
};

/**
 * Sync a single search-param with React state.
 * Pass `false` to skip clearing `page`, or an options object for debounce/replace.
 */
export function useQueryState<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T,
  resetPageOrOptions: boolean | QueryStateOptions = true,
) {
  const options: Required<QueryStateOptions> =
    typeof resetPageOrOptions === "boolean"
      ? { resetPage: resetPageOrOptions, debounceMs: 0, replace: false }
      : {
          resetPage: resetPageOrOptions.resetPage ?? true,
          debounceMs: resetPageOrOptions.debounceMs ?? 0,
          replace: resetPageOrOptions.replace ?? false,
        };

  const params = useSearchParams();
  const raw = params.get(key);
  const [seen, setSeen] = useState(raw);
  const [value, setValue] = useState<T>(() => (raw === null ? fallback : parse(raw)));
  if (seen !== raw) {
    setSeen(raw);
    setValue(raw === null ? fallback : parse(raw));
  }

  const debounceTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (debounceTimer.current != null) window.clearTimeout(debounceTimer.current);
    },
    [],
  );

  const writeUrl = (resolved: T) => {
    const url = new URL(window.location.href);
    if (resolved === fallback) url.searchParams.delete(key);
    else url.searchParams.set(key, String(resolved));
    if (options.resetPage) url.searchParams.delete("page");
    const href = url.pathname + url.search + url.hash;
    if (options.replace) window.history.replaceState(window.history.state, "", href);
    else window.history.pushState(null, "", href);
  };

  const update = (next: T | ((previous: T) => T)) => {
    const resolved =
      typeof next === "function" ? (next as (previous: T) => T)(value) : next;
    setValue(resolved);
    if (options.debounceMs > 0) {
      if (debounceTimer.current != null) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        debounceTimer.current = null;
        writeUrl(resolved);
      }, options.debounceMs);
      return;
    }
    writeUrl(resolved);
  };
  return [value, update] as const;
}

function listRequestKey(endpoint: string, query: string, field: string) {
  return `${endpoint}?${query}#${field}`;
}

/**
 * Client list fetch keyed by query string.
 * When `initial` is provided (SSR page), the matching mount query does not refetch;
 * query / revision changes issue at most one in-flight request (abort + generation).
 */
export function useListPage<T>(
  endpoint: string,
  query: string,
  initial: PaginatedList<T> | undefined,
  field: string,
) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  /** Remote mode is fixed from first render (SSR list path vs local-only). */
  const remoteEnabled = useRef(initial != null);
  /**
   * SSR query we already have data for. Skip hydrate refetch until the user
   * leaves this query (or hits retry). Cleared once query diverges so returning
   * to the same filters fetches fresh data.
   */
  const bootstrapKeyRef = useRef<string | null>(
    initial != null ? listRequestKey(endpoint, query, field) : null,
  );

  useEffect(() => {
    if (!remoteEnabled.current) return;

    const key = listRequestKey(endpoint, query, field);
    if (bootstrapKeyRef.current === key) {
      // SSR payload already matches this query — avoid redundant mount fetch.
      if (revision === 0) return;
    } else if (bootstrapKeyRef.current !== null) {
      bootstrapKeyRef.current = null;
    }

    const controller = new AbortController();
    const generation = ++sequence.current;
    const timer = window.setTimeout(async () => {
      if (controller.signal.aborted || generation !== sequence.current) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${endpoint}?${query}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || generation !== sequence.current) return;
        if (!response.ok) {
          throw new Error("Could not load this list. Your filters are preserved.");
        }
        const payload = await response.json();
        if (controller.signal.aborted || generation !== sequence.current) return;
        setData({ ...payload, items: payload[field] });
      } catch (error) {
        if (
          controller.signal.aborted ||
          generation !== sequence.current ||
          isAbortError(error)
        ) {
          return;
        }
        setError(
          error instanceof Error ? error.message : "Could not load list",
        );
      } finally {
        if (!controller.signal.aborted && generation === sequence.current) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      abortCleanup(controller);
    };
    // `initial` is bootstrap-only; do not refetch when its reference churns.
  }, [endpoint, query, field, revision]);

  return { data, error, loading, retry: () => setRevision((value) => value + 1) };
}
