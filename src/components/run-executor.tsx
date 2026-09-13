"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type LinkedIssue = {
  id: string;
  provider: string;
  remoteKey: string;
  url: string;
  title: string;
  remoteStatus: string;
  needsRetest: number;
};

type MemberOption = {
  id: string;
  name: string | null;
  email: string;
};

type CommentRow = {
  id: string;
  body: string;
  createdAt: string | Date;
  user: { id: string; name: string | null; email: string } | null;
};

type AttachmentRow = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url?: string;
};

type ResultRow = {
  id: string;
  status: string;
  notes: string;
  assigneeId: string | null;
  linkedIssues: LinkedIssue[];
  comments: CommentRow[];
  attachments: AttachmentRow[];
  case: {
    id: string;
    key: string;
    title: string;
    steps: string;
    expectedResult: string;
  };
};

type RunDetail = {
  id: string;
  name: string;
  status: string;
  description: string;
  assigneeId: string | null;
  results: ResultRow[];
};

const statuses = ["passed", "failed", "blocked", "skipped", "untested"] as const;

function IssueChip({
  issue,
  onRefresh,
  onAckRetest,
  pending,
}: {
  issue: LinkedIssue;
  onRefresh: () => void;
  onAckRetest: () => void;
  pending: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)]/80 px-2 py-1 text-xs">
      <a
        href={issue.url}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[color:var(--topo-accent)] hover:underline"
      >
        {issue.remoteKey}
      </a>
      <span className="capitalize text-[color:var(--topo-muted)]">
        {issue.remoteStatus.replace("_", " ")}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={onRefresh}
        className="text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
      >
        Sync
      </button>
      {issue.needsRetest === 1 && issue.remoteStatus === "done" ? (
        <button
          type="button"
          disabled={pending}
          onClick={onAckRetest}
          className="rounded bg-[color:var(--topo-signal)]/15 px-1.5 py-0.5 font-medium text-[color:var(--topo-signal)]"
        >
          Retest ready
        </button>
      ) : null}
    </div>
  );
}

export function RunExecutor({
  run,
  members = [],
}: {
  run: RunDetail;
  members?: MemberOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linkKey, setLinkKey] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(run.results.map((r) => [r.id, r.notes])),
  );
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const done = run.results.filter((r) => r.status !== "untested").length;
  const pct =
    run.results.length === 0
      ? 0
      : Math.round((done / run.results.length) * 100);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/runs/${run.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError("Update failed");
      return;
    }
    refresh();
  }

  async function issueAction(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Issue action failed");
      return;
    }
    refresh();
  }

  async function postComment(resultId: string) {
    const body = (commentDraft[resultId] ?? "").trim();
    if (!body) return;
    setError(null);
    const res = await fetch(`/api/results/${resultId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(typeof data.error === "string" ? data.error : "Comment failed");
      return;
    }
    setCommentDraft((prev) => ({ ...prev, [resultId]: "" }));
    refresh();
  }

  async function uploadFile(resultId: string, file: File | null) {
    if (!file) return;
    setUploadingId(resultId);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/results/${resultId}/attachments`, {
      method: "POST",
      body: form,
    });
    setUploadingId(null);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(typeof data.error === "string" ? data.error : "Upload failed");
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manual run"
        title={run.name}
        description={run.description || "No description"}
        meta={
          <>
            <StatusChip tone={statusToneForRun(run.status)} mono>
              {run.status.replace("_", " ")}
            </StatusChip>
            <StatusChip mono>
              {done}/{run.results.length} · {pct}%
            </StatusChip>
            <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
              {run.id.slice(0, 8)}
            </span>
          </>
        }
        actions={
          <>
            {run.status === "planned" ? (
              <Button
                size="sm"
                variant="primary"
                isDisabled={pending}
                onPress={() => void patch({ action: "start" })}
              >
                Start
              </Button>
            ) : null}
            {run.status !== "completed" ? (
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => void patch({ action: "complete" })}
              >
                Complete
              </Button>
            ) : null}
            <Link
              href={`/reports/${run.id}`}
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              View report
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2 text-xs">
        <span className="text-[color:var(--topo-muted)]">Run assignee</span>
        <select
          className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-[color:var(--topo-ink)]"
          value={run.assigneeId ?? ""}
          disabled={pending}
          onChange={(e) =>
            void patch({
              action: "assign",
              assigneeId: e.target.value || null,
            })
          }
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
          <span>
            Progress {done}/{run.results.length}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-sm bg-[color:var(--topo-line)]">
          <motion.div
            className="h-full bg-[color:var(--topo-accent)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {run.results.map((result, i) => (
          <motion.article
            key={result.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.02 }}
            className="p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-[color:var(--topo-accent)]">
                  {result.case.key}
                </div>
                <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
                  {result.case.title}
                </h2>
              </div>
              <div className="flex flex-wrap gap-1">
                {statuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void patch({
                        caseId: result.case.id,
                        status,
                        notes: notesDraft[result.id] ?? result.notes,
                      })
                    }
                    className={`rounded-md px-2 py-1 text-xs capitalize transition active:scale-[0.98] ${
                      result.status === status
                        ? "bg-[color:var(--topo-ink)] text-[color:var(--topo-panel)]"
                        : "bg-[color:var(--topo-chip)] text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            {result.case.steps ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] p-2.5 font-mono text-[11px] text-[color:var(--topo-muted)]">
                {result.case.steps}
              </pre>
            ) : null}
            {result.case.expectedResult ? (
              <p className="mt-2 text-xs text-[color:var(--topo-muted)]">
                Expected: {result.case.expectedResult}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="text-xs text-[color:var(--topo-muted)]">
                Assign
                <select
                  className="ml-2 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs text-[color:var(--topo-ink)]"
                  value={result.assigneeId ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    void patch({
                      action: "assign_result",
                      resultId: result.id,
                      assigneeId: e.target.value || null,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.email}
                    </option>
                  ))}
                </select>
              </label>
              {result.linkedIssues.map((issue) => (
                <IssueChip
                  key={issue.id}
                  issue={issue}
                  pending={pending}
                  onRefresh={() =>
                    void issueAction({ action: "refresh", issueId: issue.id })
                  }
                  onAckRetest={() =>
                    void issueAction({
                      action: "ack_retest",
                      issueId: issue.id,
                    })
                  }
                />
              ))}
              {result.status === "failed" || result.status === "blocked" ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={pending}
                    onPress={() =>
                      void issueAction({
                        action: "create",
                        resultId: result.id,
                        provider: "mock",
                      })
                    }
                  >
                    Create issue
                  </Button>
                  <div className="flex items-center gap-1">
                    <input
                      value={linkKey[result.id] ?? ""}
                      onChange={(e) =>
                        setLinkKey((prev) => ({
                          ...prev,
                          [result.id]: e.target.value,
                        }))
                      }
                      placeholder="Link key (MOCK-1)"
                      className="w-36 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={pending || !(linkKey[result.id] ?? "").trim()}
                      onPress={() =>
                        void issueAction({
                          action: "link",
                          resultId: result.id,
                          remoteKey: (linkKey[result.id] ?? "").trim(),
                          provider: "mock",
                        })
                      }
                    >
                      Link
                    </Button>
                  </div>
                </>
              ) : null}
            </div>

            <label className="mt-3 block space-y-1 text-xs">
              <span className="text-[color:var(--topo-muted)]">Notes</span>
              <textarea
                value={notesDraft[result.id] ?? ""}
                onChange={(e) =>
                  setNotesDraft((prev) => ({
                    ...prev,
                    [result.id]: e.target.value,
                  }))
                }
                onBlur={() => {
                  const next = notesDraft[result.id] ?? "";
                  if (next === result.notes) return;
                  void patch({
                    caseId: result.case.id,
                    status: result.status,
                    notes: next,
                  });
                }}
                rows={2}
                className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
                placeholder="Optional notes for this result"
              />
            </label>

            <div className="mt-3 space-y-2 border-t border-[color:var(--topo-line)] pt-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                Comments
              </p>
              {result.comments.length === 0 ? (
                <p className="text-xs text-[color:var(--topo-muted)]">
                  No comments yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {result.comments.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)]/60 px-2 py-1.5 text-xs"
                    >
                      <div className="flex justify-between gap-2 text-[color:var(--topo-muted)]">
                        <span>{c.user?.name ?? c.user?.email ?? "Unknown"}</span>
                        <span className="font-mono">
                          {new Date(c.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[color:var(--topo-ink)]">
                        {c.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  value={commentDraft[result.id] ?? ""}
                  onChange={(e) =>
                    setCommentDraft((prev) => ({
                      ...prev,
                      [result.id]: e.target.value,
                    }))
                  }
                  placeholder="Add a comment"
                  className="min-w-[12rem] flex-1 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={
                    pending || !(commentDraft[result.id] ?? "").trim()
                  }
                  onPress={() => void postComment(result.id)}
                >
                  Comment
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                Attachments
              </p>
              {result.attachments.length === 0 ? (
                <p className="text-xs text-[color:var(--topo-muted)]">
                  No files yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {result.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={a.url ?? `/api/attachments/${a.id}`}
                        className="font-mono text-xs text-[color:var(--topo-accent)] hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.filename}
                      </a>
                      <span className="ml-2 text-[10px] text-[color:var(--topo-muted)]">
                        {(a.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[color:var(--topo-muted)]">
                <span className="rounded-md border border-[color:var(--topo-line)] px-2 py-1 hover:text-[color:var(--topo-ink)]">
                  {uploadingId === result.id ? "Uploading…" : "Attach file"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadingId === result.id || pending}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void uploadFile(result.id, file);
                  }}
                />
              </label>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}
