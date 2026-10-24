"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { CheckIcon, PlayIcon, StopIcon } from "@phosphor-icons/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";
import { isRunFrozen } from "@/lib/run-immutability";
import type { LiveEvent } from "@/lib/live-event";
import { useShortcut } from "./shortcut-layer";
import { useLiveUpdates } from "./use-live-updates";
import { RunCaseDetail } from "./run-case-detail";
import { RunCaseList } from "./run-case-list";
import { RunProgressBar } from "./run-progress-bar";
import {
  applyAttachmentToRun,
  applyCommentToRun,
  applyIssueToRun,
  applyRunAction,
  filterRunResults,
  initialFocusId,
  neighborId,
  nextUntestedId,
  type CommentRow,
  type LinkedIssue,
  type MemberOption,
  type ResultRow,
  type RunAction,
  type RunDetail,
  type StatusFilter,
} from "./run-executor-model";

export function RunExecutor({
  run,
  members = [],
  currentUserId = null,
  currentUser = null,
}: {
  run: RunDetail;
  members?: MemberOption[];
  currentUserId?: string | null;
  currentUser?: { id: string; name: string | null; email: string } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [runState, setRunState] = useState(run);
  const [focusedId, setFocusedId] = useState(() => initialFocusId(run.results));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  if (runState.id !== run.id) {
    setRunState(run);
    setFocusedId(initialFocusId(run.results));
    setDetailOpen(false);
  }
  const [optimisticRun, addOptimisticRun] = useOptimistic(
    runState,
    applyRunAction,
  );
  const [error, setError] = useState<string | null>(null);
  const [linkKey, setLinkKey] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(run.results.map((row) => [row.id, row.notes])),
  );
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [issueBusy, setIssueBusy] = useState(false);
  const completeModal = useOverlayState();
  const abortModal = useOverlayState();
  const frozen = isRunFrozen(optimisticRun.status);
  const aborted = optimisticRun.status === "aborted";
  const done = optimisticRun.results.filter((row) => row.status !== "untested").length;

  const filtered = useMemo(
    () =>
      filterRunResults(optimisticRun.results, {
        status: statusFilter,
        mine: mineOnly,
        query,
        currentUserId,
      }),
    [optimisticRun.results, statusFilter, mineOnly, query, currentUserId],
  );

  const focusedResult =
    optimisticRun.results.find((row) => row.id === focusedId) ?? null;

  useEffect(() => {
    if (filtered.length === 0) return;
    if (!filtered.some((row) => row.id === focusedId)) {
      setFocusedId(filtered[0].id);
    }
  }, [filtered, focusedId]);

  const onLive = useCallback(
    (event: LiveEvent) => {
      if (event.topic !== "run") return;
      if (event.entityId && event.entityId !== runState.id) return;
      if (event.resultId) {
        setRunState((current) =>
          applyRunAction(current, {
            type: "result",
            resultId: event.resultId!,
            status: event.status,
            assigneeId: event.assigneeId,
          }),
        );
      }
      if (event.runStatus || (event.assigneeId !== undefined && !event.resultId)) {
        setRunState((current) =>
          applyRunAction(current, {
            type: "run",
            status: event.runStatus,
            assigneeId: event.assigneeId,
          }),
        );
      }
    },
    [runState.id],
  );
  useLiveUpdates(onLive, { runId: runState.id });

  async function patch(body: Record<string, unknown>, action?: RunAction) {
    setError(null);
    const resPromise = fetch(`/api/runs/${runState.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (action) {
      startTransition(async () => {
        addOptimisticRun(action);
        const live = await resPromise;
        if (live.ok) {
          setRunState((current) => applyRunAction(current, action));
        }
      });
    }
    const res = await resPromise;
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(typeof data?.error === "string" ? data.error : "Update failed");
      return false;
    }
    return true;
  }

  const recordStatus = useCallback(
    (result: ResultRow, status: string) => {
      void patch(
        {
          caseId: result.case.id,
          resultId: result.id,
          status,
          notes: notesDraft[result.id] ?? result.notes,
        },
        { type: "result", resultId: result.id, status },
      );
      if (status === "untested") return;
      const preview = optimisticRun.results.map((row) =>
        row.id === result.id ? { ...row, status } : row,
      );
      const nextId = nextUntestedId(
        filterRunResults(preview, {
          status: statusFilter,
          mine: mineOnly,
          query,
          currentUserId,
        }),
        result.id,
      );
      if (nextId) setFocusedId(nextId);
    },
    [
      currentUserId,
      mineOnly,
      notesDraft,
      optimisticRun.results,
      query,
      statusFilter,
    ],
  );

  useShortcut(
    "nav-next",
    useCallback(() => {
      setFocusedId((current) => neighborId(filtered, current, 1));
    }, [filtered]),
  );
  useShortcut(
    "nav-prev",
    useCallback(() => {
      setFocusedId((current) => neighborId(filtered, current, -1));
    }, [filtered]),
  );
  useShortcut(
    "pass",
    useCallback(() => {
      if (focusedResult && !frozen) recordStatus(focusedResult, "passed");
    }, [focusedResult, frozen, recordStatus]),
  );
  useShortcut(
    "fail",
    useCallback(() => {
      if (focusedResult && !frozen) recordStatus(focusedResult, "failed");
    }, [focusedResult, frozen, recordStatus]),
  );
  useShortcut(
    "blocked",
    useCallback(() => {
      if (focusedResult && !frozen) recordStatus(focusedResult, "blocked");
    }, [focusedResult, frozen, recordStatus]),
  );
  useShortcut(
    "skipped",
    useCallback(() => {
      if (focusedResult && !frozen) recordStatus(focusedResult, "skipped");
    }, [focusedResult, frozen, recordStatus]),
  );
  useShortcut(
    "assign",
    useCallback(() => {
      const root = document.querySelector<HTMLSelectElement>(
        `[data-result-id="${focusedResult?.id ?? ""}"] select[data-assign]`,
      );
      root?.focus();
    }, [focusedResult?.id]),
  );

  async function confirmComplete() {
    const ok = await patch(
      { action: "complete" },
      { type: "run", status: "completed" },
    );
    if (ok) completeModal.close();
  }

  async function confirmAbort() {
    const ok = await patch(
      { action: "abort" },
      { type: "run", status: "aborted" },
    );
    if (ok) abortModal.close();
  }

  async function issueAction(body: Record<string, unknown>) {
    setError(null);
    setIssueBusy(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        issue?: Partial<LinkedIssue> & { id?: string; resultId?: string };
      };
      if (!res.ok) {
        setError(data.error ?? "Issue action failed");
        return;
      }
      const raw = data.issue;
      const id = raw?.id;
      const provider = raw?.provider;
      const remoteKey = raw?.remoteKey;
      const url = raw?.url;
      const title = raw?.title;
      if (id && provider && remoteKey && url && title) {
        setRunState((current) =>
          applyIssueToRun(
            current,
            {
              id,
              provider,
              remoteKey,
              url,
              title,
              remoteStatus: raw.remoteStatus ?? "open",
              needsRetest: raw.needsRetest ?? 0,
            },
            typeof body.resultId === "string" ? body.resultId : raw.resultId,
          ),
        );
      }
    } finally {
      setIssueBusy(false);
    }
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
    const data = (await res.json().catch(() => null)) as
      | { error?: string; comment?: Partial<CommentRow> & { id?: string } }
      | null;
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Comment failed");
      return;
    }
    const raw = data?.comment;
    const commentId = raw?.id;
    const commentBody = raw?.body;
    if (commentId && commentBody) {
      setRunState((current) =>
        applyCommentToRun(current, resultId, {
          id: commentId,
          body: commentBody,
          createdAt: raw.createdAt ?? new Date().toISOString(),
          user: raw.user ?? currentUser,
        }),
      );
    }
    setCommentDraft((prev) => ({ ...prev, [resultId]: "" }));
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
    const data = (await res.json().catch(() => null)) as
      | {
          error?: string;
          attachment?: {
            id: string;
            filename: string;
            contentType: string;
            sizeBytes: number;
            url?: string;
          };
        }
      | null;
    setUploadingId(null);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Upload failed");
      return;
    }
    const raw = data?.attachment;
    if (raw?.id && raw.filename) {
      setRunState((current) =>
        applyAttachmentToRun(current, resultId, {
          id: raw.id,
          filename: raw.filename,
          contentType: raw.contentType,
          sizeBytes: raw.sizeBytes,
          url: raw.url ?? `/api/attachments/${raw.id}`,
        }),
      );
    }
  }

  function selectCase(resultId: string) {
    setFocusedId(resultId);
    setDetailOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Manual run"
        title={optimisticRun.name}
        description={optimisticRun.description || "No description"}
        meta={
          <>
            <StatusChip tone={statusToneForRun(optimisticRun.status)} mono>
              {optimisticRun.status}
            </StatusChip>
            <StatusChip mono>
              {done}/{optimisticRun.results.length} ·{" "}
              {optimisticRun.results.length === 0
                ? 0
                : Math.round((done / optimisticRun.results.length) * 100)}
              %
            </StatusChip>
            <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
              {optimisticRun.id.slice(0, 8)}
            </span>
          </>
        }
        actions={
          <>
            {optimisticRun.status === "planned" ? (
              <Button
                size="sm"
                variant="primary"
                className="gap-1.5"
                isDisabled={pending}
                onPress={() =>
                  void patch(
                    { action: "start" },
                    { type: "run", status: "in_progress" },
                  )
                }
              >
                <PlayIcon size={14} weight="bold" aria-hidden />
                Start
              </Button>
            ) : null}
            {!frozen ? (
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                isDisabled={pending}
                onPress={() => completeModal.open()}
              >
                <CheckIcon size={14} weight="bold" aria-hidden />
                Complete
              </Button>
            ) : null}
            {!frozen ? (
              <Button
                size="sm"
                variant="danger"
                className="gap-1.5"
                isDisabled={pending}
                onPress={() => abortModal.open()}
              >
                <StopIcon size={14} weight="bold" aria-hidden />
                Abort
              </Button>
            ) : null}
            {optimisticRun.status === "completed" ? (
              <Link
                href={`/reports/${optimisticRun.id}`}
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
              >
                View report
              </Link>
            ) : null}
          </>
        }
      />

      {aborted ? (
        <p
          role="status"
          className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/40 px-3 py-2 text-xs text-[color:var(--topo-muted)]"
        >
          This run was aborted and is locked. Results are kept, but they can no
          longer be edited.
        </p>
      ) : frozen ? (
        <p
          role="status"
          className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/40 px-3 py-2 text-xs text-[color:var(--topo-muted)]"
        >
          This run is completed and locked. Results and structure can no longer
          be edited. Comments and attachments are still allowed.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2 text-xs">
        <span className="text-[color:var(--topo-muted)]">Run assignee</span>
        <select
          className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-[color:var(--topo-ink)] accent-[color:var(--topo-accent)]"
          value={optimisticRun.assigneeId ?? ""}
          disabled={pending}
          onChange={(e) =>
            void patch(
              {
                action: "assign",
                assigneeId: e.target.value || null,
              },
              { type: "run", assigneeId: e.target.value || null },
            )
          }
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.email}
            </option>
          ))}
        </select>
      </div>

      <RunProgressBar results={optimisticRun.results} />

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="grid h-[min(44rem,calc(100dvh-13rem))] min-h-[20rem] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <aside
          className={`min-h-0 flex-col border-[color:var(--topo-line)] md:flex md:border-r ${
            detailOpen ? "hidden" : "flex"
          }`}
        >
          <RunCaseList
            results={optimisticRun.results}
            filtered={filtered}
            focusedId={focusedId}
            members={members}
            statusFilter={statusFilter}
            mineOnly={mineOnly}
            query={query}
            currentUserId={currentUserId}
            onStatusFilter={setStatusFilter}
            onMineOnly={setMineOnly}
            onQueryChange={setQuery}
            onSelect={selectCase}
          />
        </aside>
        <section
          className={`min-h-0 flex-col md:flex ${detailOpen ? "flex" : "hidden"}`}
        >
          <RunCaseDetail
            result={focusedResult}
            members={members}
            frozen={frozen}
            pending={pending}
            issueBusy={issueBusy}
            uploading={uploadingId === focusedResult?.id}
            notes={
              focusedResult
                ? (notesDraft[focusedResult.id] ?? focusedResult.notes)
                : ""
            }
            commentDraft={
              focusedResult ? (commentDraft[focusedResult.id] ?? "") : ""
            }
            linkKey={focusedResult ? (linkKey[focusedResult.id] ?? "") : ""}
            onBack={() => setDetailOpen(false)}
            onRecordStatus={(status) => {
              if (focusedResult) recordStatus(focusedResult, status);
            }}
            onStepStatus={(position, status) => {
              if (!focusedResult) return;
              void patch(
                {
                  caseId: focusedResult.case.id,
                  resultId: focusedResult.id,
                  stepResults: [{ position, status }],
                },
                {
                  type: "result",
                  resultId: focusedResult.id,
                  step: { position, status },
                },
              );
            }}
            onAssign={(assigneeId) => {
              if (!focusedResult) return;
              void patch(
                {
                  action: "assign_result",
                  resultId: focusedResult.id,
                  assigneeId,
                },
                {
                  type: "result",
                  resultId: focusedResult.id,
                  assigneeId,
                },
              );
            }}
            onNotesChange={(value) => {
              if (!focusedResult) return;
              setNotesDraft((prev) => ({ ...prev, [focusedResult.id]: value }));
            }}
            onNotesBlur={() => {
              if (!focusedResult || frozen) return;
              const next = notesDraft[focusedResult.id] ?? "";
              if (next === focusedResult.notes) return;
              void patch(
                {
                  caseId: focusedResult.case.id,
                  resultId: focusedResult.id,
                  status: focusedResult.status,
                  notes: next,
                },
                { type: "result", resultId: focusedResult.id, notes: next },
              );
            }}
            onCommentDraftChange={(value) => {
              if (!focusedResult) return;
              setCommentDraft((prev) => ({
                ...prev,
                [focusedResult.id]: value,
              }));
            }}
            onComment={() => {
              if (focusedResult) void postComment(focusedResult.id);
            }}
            onUpload={(file) => {
              if (focusedResult) void uploadFile(focusedResult.id, file);
            }}
            onLinkKeyChange={(value) => {
              if (!focusedResult) return;
              setLinkKey((prev) => ({ ...prev, [focusedResult.id]: value }));
            }}
            onIssueAction={(body) => void issueAction(body)}
          />
        </section>
      </div>

      <Modal.Root state={abortModal}>
        <Modal.Backdrop isDismissable={!pending}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  Abort this run?
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  Aborting marks this run aborted and locks results. The run
                  stays in the list with an aborted status. Results are kept
                  and are no longer editable.
                </p>
              </Modal.Header>
              <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
                <Button
                  variant="tertiary"
                  isDisabled={pending}
                  onPress={() => abortModal.close()}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  isDisabled={pending}
                  onPress={() => void confirmAbort()}
                >
                  {pending ? "Aborting…" : "Abort run"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root state={completeModal}>
        <Modal.Backdrop isDismissable={!pending}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  Complete this run?
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  Completing is permanent. Results and case structure will be
                  locked and can no longer be edited. You can still add comments
                  and attachments afterward.
                </p>
              </Modal.Header>
              <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
                <Button
                  variant="tertiary"
                  isDisabled={pending}
                  onPress={() => completeModal.close()}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  isDisabled={pending}
                  onPress={() => void confirmComplete()}
                >
                  {pending ? "Completing…" : "Complete run"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}
