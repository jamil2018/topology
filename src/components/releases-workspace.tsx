"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

export type ReleaseListItem = {
  id: string;
  name: string;
  gitTag: string | null;
  sha: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  releasedAt: Date | string | null;
  snapshot: {
    id: string;
    createdAt: Date | string;
    payload: {
      requirement: { covered: number; total: number; pct: number | null };
      risk: { covered: number; total: number; pct: number | null };
      automation: { covered: number; total: number; pct: number | null };
      execution: { covered: number; total: number; pct: number | null };
      flakeCount: number;
      unverifiedChanges: number;
    } | null;
  } | null;
};

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReleasesWorkspace({
  initial,
}: {
  initial: ReleaseListItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const items = initial;
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    gitTag: "",
    sha: "",
  });
  const [compareBefore, setCompareBefore] = useState("");
  const [compareAfter, setCompareAfter] = useState("");

  async function createRelease() {
    if (!draft.name.trim()) return;
    setError(null);
    const res = await fetch("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        gitTag: draft.gitTag.trim() || null,
        sha: draft.sha.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Could not create release",
      );
      return;
    }
    setDraft({ name: "", gitTag: "", sha: "" });
    startTransition(() => router.refresh());
    if (data.release?.id) {
      router.push(`/releases/${data.release.id}`);
    }
  }

  function openCompare() {
    if (!compareBefore || !compareAfter || compareBefore === compareAfter) {
      setError("Pick two different releases to compare");
      return;
    }
    router.push(
      `/releases/compare?before=${compareBefore}&after=${compareAfter}`,
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Control plane"
        title="Releases"
        description="Bind a git tag or SHA, freeze coverage into a snapshot, and compare releases."
        meta={<StatusChip mono>{items.length}</StatusChip>}
        actions={
          <Link
            href="/releases/compare"
            className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)]"
          >
            Compare
          </Link>
        }
      />

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          New release
        </h2>
        <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
          Creating a release stores a coverage snapshot from the current workspace
          graph.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Input
            aria-label="Release name"
            placeholder="8.4"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <Input
            aria-label="Git tag"
            placeholder="v8.4.0"
            value={draft.gitTag}
            onChange={(e) => setDraft((d) => ({ ...d, gitTag: e.target.value }))}
          />
          <Input
            aria-label="Commit SHA"
            placeholder="abc123…"
            value={draft.sha}
            onChange={(e) => setDraft((d) => ({ ...d, sha: e.target.value }))}
          />
        </div>
        <Button
          className="mt-3"
          onPress={() => void createRelease()}
          isDisabled={pending}
        >
          Create release
        </Button>
      </div>

      {items.length >= 2 ? (
        <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Compare releases
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--topo-muted)]">
              Before
              <select
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
                value={compareBefore}
                onChange={(e) => setCompareBefore(e.target.value)}
              >
                <option value="">Select…</option>
                {items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--topo-muted)]">
              After
              <select
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
                value={compareAfter}
                onChange={(e) => setCompareAfter(e.target.value)}
              >
                <option value="">Select…</option>
                {items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <Button onPress={openCompare}>Compare</Button>
          </div>
        </div>
      ) : null}

      <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[color:var(--topo-muted)]">
            No releases yet. Create one from a completed CI SHA or tag to freeze
            coverage.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {items.map((rel) => {
              const reqPct = rel.snapshot?.payload?.requirement.pct;
              return (
                <li key={rel.id}>
                  <Link
                    href={`/releases/${rel.id}`}
                    className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 transition-colors hover:bg-[color:var(--topo-chip)]/50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[color:var(--topo-ink)]">
                        {rel.name}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-[color:var(--topo-muted)]">
                        {rel.gitTag ?? "no tag"}
                        {rel.sha ? ` · ${rel.sha.slice(0, 8)}` : ""}
                        {rel.milestoneName ? ` · ${rel.milestoneName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip mono>{formatDate(rel.releasedAt)}</StatusChip>
                      {reqPct != null ? (
                        <StatusChip mono>req {reqPct}%</StatusChip>
                      ) : (
                        <StatusChip mono>no snapshot</StatusChip>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
