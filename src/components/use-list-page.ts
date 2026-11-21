"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PaginatedList } from "@/lib/list-pagination";

export function useQueryState<T>(key: string, fallback: T, parse: (raw: string) => T, resetPage = true) {
  const params = useSearchParams();
  const raw = params.get(key);
  const [seen, setSeen] = useState(raw);
  const [value, setValue] = useState<T>(() => raw === null ? fallback : parse(raw));
  if (seen !== raw) { setSeen(raw); setValue(raw === null ? fallback : parse(raw)); }
  const update = (next: T | ((previous: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(value) : next;
    setValue(resolved);
    const url = new URL(window.location.href);
    if (resolved === fallback) url.searchParams.delete(key); else url.searchParams.set(key, String(resolved));
    if (resetPage) url.searchParams.delete("page");
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  };
  return [value, update] as const;
}

export function useListPage<T>(endpoint: string, query: string, initial: PaginatedList<T> | undefined, field: string) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    if (!initial) return;
    let cancelled = false;
    const generation = ++sequence.current;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setLoading(true); setError(null);
      try {
        const response = await fetch(`${endpoint}?${query}`);
        if (!response.ok) throw new Error("Could not load this list. Your filters are preserved.");
        const payload = await response.json();
        if (!cancelled && generation === sequence.current) setData({ ...payload, items: payload[field] });
      } catch (error) {
        if (!cancelled && generation === sequence.current) setError(error instanceof Error ? error.message : "Could not load list");
      } finally {
        if (!cancelled && generation === sequence.current) setLoading(false);
      }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  // Initial data is a bootstrap; query changes drive subsequent requests.
  }, [endpoint, query, field, revision, initial]);
  return { data, error, loading, retry: () => setRevision((value) => value + 1) };
}
