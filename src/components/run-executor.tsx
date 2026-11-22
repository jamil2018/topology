"use client";
import { RunProductivityActions } from "./run-productivity-actions";
import { useRunResume } from "./use-run-resume";
import { useProjectActions } from "./project-actions";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Button, Dropdown, Modal, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  CheckIcon,
  DotsThreeIcon,
  PlayIcon,
  StopIcon,
} from "@phosphor-icons/react";
import { formatStatusLabel } from "@/lib/format-labels";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";
import { isReopenableRunStatus, isRunFrozen, RUN_REOPEN_MESSAGE } from "@/lib/run-immutability";
import type { LiveEvent } from "@/lib/live-event";
import { useShortcut } from "./shortcut-layer";
import { useLiveUpdates } from "./use-live-updates";
import { RunCaseDetail } from "./run-case-detail";
import { RunCaseList } from "./run-case-list";
import { RunProgressBar } from "./run-progress-bar";
import { TopoSelect } from "./ui/topo-select";
import {
  applyAttachmentToRun,
  applyCommentToRun,
  applyIssueToRun,
  applyRunAction,
  countResultStatuses,
  filterRunResults,
  initialFocusId,
  neighborId,
  nextUntestedId,
  rollupStepStatuses,
  type CommentRow,
  type LinkedIssue,
  type MemberOption,
  type ResultRow,
  type RunAction,
  type RunDetail,
  type StatusFilter,
} from "./run-executor-model";

type StatusRetry = {
  resultId: string;
  caseId: string;
  status: string;
  notes: string;
  durationMs?: number;
  step?: { position: number; status: string };
  message: string;
};

export function RunExecutor({
  run,
  members = [],
  currentUserId = null,
  currentUser = null,
  defaultProvider = "mock",
  availableProviders,
}: {
  run: RunDetail;
  members?: MemberOption[];
  currentUserId?: string | null;
  currentUser?: { id: string; name: string | null; email: string } | null;
  defaultProvider?: string;
  availableProviders?: string[];
}) {
  const issueProviders = availableProviders?.length
    ? availableProviders
    : [defaultProvider];
  const { can, projectId, userId } = useProjectActions();
  const router = useRouter();
  const mutationQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const mutationVersion = useRef(0);
  const failedNoteSaves = useRef(new Set<string>());
  const activeRunId = useRef(run.id);
  useEffect(() => { activeRunId.current = run.id; }, [run.id]);
  const [pending, startTransition] = useTransition();
  const [runState, setRunState] = useState(run);
  const [focusedId, setFocusedId] = useState(() => initialFocusId(run.results));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  useRunResume(`topology:run:${userId}:${projectId}:${run.id}`, run.results.map((result) => result.id), { focusedId, statusFilter, mineOnly, query }, (saved) => {
    if (saved.focusedId !== undefined) setFocusedId(saved.focusedId);
    if (saved.statusFilter !== undefined) setStatusFilter(saved.statusFilter);
    if (saved.mineOnly !== undefined) setMineOnly(saved.mineOnly);
    if (saved.query !== undefined) setQuery(saved.query);
  });
  const [detailOpen, setDetailOpen] = useState(true);
  if (runState.id !== run.id) {
    setRunState(run);
    setFocusedId(initialFocusId(run.results));
    setDetailOpen(true);
    setSelectedIds(new Set());
  }
  const [optimisticRun, addOptimisticRun] = useOptimistic(
    runState,
    applyRunAction,
  );
  const [error, setError] = useState<string | null>(null);
  const [statusRetry, setStatusRetry] = useState<StatusRetry | null>(null);
  const [linkKey, setLinkKey] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(run.results.map((row) => [row.id, row.notes])),
  );
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const uploadCounts = useRef<Record<string, number>>({});
  const readTimerMs = useRef<() => number>(() => 0);
  const [issueBusy, setIssueBusy] = useState(false);
  const completeModal = useOverlayState();
  const abortModal = useOverlayState();
  const reopenModal = useOverlayState();
  const frozen = isRunFrozen(optimisticRun.status);
  const aborted = optimisticRun.status === "aborted";
  const canReopen = isReopenableRunStatus(optimisticRun.status) && can("runs.complete");
  const done = optimisticRun.results.filter((row) => row.status !== "untested").length;
  const failureResults = useMemo(
    () =>
      optimisticRun.results.filter((row) =>
        ["failed", "blocked"].includes(row.status),
      ),
    [optimisticRun.results],
  );
  const retestHref =
    failureResults.length > 0
      ? `/runs/new?retest=${failureResults.map((row) => row.id).join(",")}`
      : null;
  const showRetestInHeader =
    Boolean(retestHref) &&
    can("runs.create") &&
    optimisticRun.status === "completed";
  const showRetestInMore =
    Boolean(retestHref) && can("runs.create") && !showRetestInHeader;

  const statusCounts = useMemo(
    () => countResultStatuses(optimisticRun.results),
    [optimisticRun.results],
  );
  const mineCount = useMemo(
    () =>
      currentUserId
        ? optimisticRun.results.filter((row) => row.assigneeId === currentUserId)
            .length
        : 0,
    [optimisticRun.results, currentUserId],
  );

  const filtered = useMemo(
    () =>
      filterRunResults(optimisticRun.results, {
        status: statusFilter,
        mine: mineOnly,
        query: deferredQuery,
        currentUserId,
      }),
    [optimisticRun.results, statusFilter, mineOnly, deferredQuery, currentUserId],
  );

  const focusedResult =
    optimisticRun.results.find((row) => row.id === focusedId) ?? null;

  useEffect(() => {
    if (filtered.length === 0) return;
    if (!filtered.some((row) => row.id === focusedId)) {
      setFocusedId(filtered[0].id);
    }
  }, [filtered, focusedId]);

  const advanceAfterStatus = useCallback(
    (results: ResultRow[], fromId: string, nextStatus: string) => {
      if (nextStatus === "untested") return;
      const nextId = nextUntestedId(
        filterRunResults(results, {
          status: statusFilter,
          mine: mineOnly,
          query: deferredQuery,
          currentUserId,
        }),
        fromId,
      );
      if (nextId) setFocusedId(nextId);
    },
    [statusFilter, mineOnly, deferredQuery, currentUserId],
  );

  const onLive = useCallback(
    (event: LiveEvent) => {
      if (event.topic !== "run") return;
      if (event.entityId && event.entityId !== runState.id) return;
      if (event.kind === "comment" && event.resultId && event.comment) {
        setRunState((current) =>
          applyCommentToRun(current, event.resultId!, {
            id: event.comment!.id,
            body: event.comment!.body,
            createdAt: event.comment!.createdAt,
            user: event.comment!.user ?? null,
          }),
        );
        return;
      }
      if (event.kind === "attachment" && event.resultId && event.attachment) {
        setRunState((current) =>
          applyAttachmentToRun(current, event.resultId!, {
            id: event.attachment!.id,
            filename: event.attachment!.filename,
            contentType: event.attachment!.contentType,
            sizeBytes: event.attachment!.sizeBytes,
            url: event.attachment!.url ?? `/api/attachments/${event.attachment!.id}`,
          }),
        );
        return;
      }
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
  const liveStatus = useLiveUpdates(onLive, { runId: runState.id, onReconnect: async () => {
    const runId = runState.id;
    try {
      // A reconnect snapshot must follow all queued writes. If another write
      // arrives during the read, retry after it instead of installing old data.
      while (activeRunId.current === runId) {
        const queued = mutationQueue.current;
        await queued;
        if (queued !== mutationQueue.current) continue;
        const version = mutationVersion.current;
        const response = await fetch(`/api/runs/${runId}`);
        if (!response.ok) throw new Error("Unable to refresh run");
        const data = await response.json();
        if (activeRunId.current !== runId) return;
        if (version !== mutationVersion.current) continue;
        setNotesDraft((drafts) => Object.fromEntries(Object.entries(drafts).map(([id, notes]) => {
          const previous = runState.results.find((result) => result.id === id);
          const fresh = data.run.results.find((result: { id: string; notes: string }) => result.id === id);
          return [id, previous && fresh && notes === previous.notes ? fresh.notes : notes];
        })));
        setRunState((current) => current.id !== runId ? current : ({ ...current, status: data.run.status, assigneeId: data.run.assigneeId, results: current.results.map((result) => {
          const fresh = data.run.results.find((item: { id: string; durationMs?: number | null }) => item.id === result.id);
          return fresh ? { ...result, status: fresh.status, assigneeId: fresh.assigneeId, notes: fresh.notes, durationMs: fresh.durationMs ?? result.durationMs, stepResults: fresh.stepResults ?? result.stepResults } : result;
        }) }));
        return;
      }
    } catch { if (activeRunId.current === runId) setError("Reconnected, but the latest results could not be loaded. Reload to retry; keep a copy of unsaved notes."); }
  } });

  async function patch(
    body: Record<string, unknown>,
    action?: RunAction,
    background = false,
    opts?: { trackNotesFailure?: boolean; silentError?: boolean },
  ): Promise<boolean> {
    const trackNotesFailure = opts?.trackNotesFailure ?? background;
    const silentError = opts?.silentError ?? false;
    const permission =
      body.action === "complete" || body.action === "reopen"
        ? "runs.complete"
        : body.action === "abort"
          ? "runs.delete"
          : "runs.edit";
    if (!can(permission)) return false;
    const runId = runState.id;
    const previous = mutationQueue.current;
    mutationVersion.current += 1;
    const write = async () => {
      await previous;
      if (activeRunId.current !== runId) return false;
      if ((body.action === "complete" || body.action === "abort" || body.action === "reopen") && [...failedNoteSaves.current].some(key => key.startsWith(`${runId}:`))) {
        setError("Save your unsaved notes before completing, aborting, or reopening this run.");
        return false;
      }
      if (!silentError) setError(null);
      if (action && !background) addOptimisticRun(action);
      try {
        const response = await fetch(`/api/runs/${runId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Update failed");
        if (activeRunId.current !== runId) return false;
        if (typeof body.notes === "string") failedNoteSaves.current.delete(`${runId}:${body.resultId}`);
        if (action) setRunState((current) => current.id === runId ? applyRunAction(current, action) : current);
        return true;
      } catch (error) {
        if (trackNotesFailure) failedNoteSaves.current.add(`${runId}:${body.resultId}`);
        if (activeRunId.current === runId && !silentError) {
          setError(error instanceof Error ? error.message : "Unable to save. Your draft is still here.");
        }
        return false;
      }
    };
    // Autosave must not disable the control receiving the blur's next click.
    // Explicit actions wait for it and remain ordered on the server.
    const result = background ? write() : new Promise<boolean>((resolve) => {
      startTransition(async () => { resolve(await write()); });
    });
    mutationQueue.current = result;
    return result;
  }

  const persistResultStatus = useCallback(
    async (
      result: ResultRow,
      action: Extract<RunAction, { type: "result" }>,
      body: Record<string, unknown>,
    ) => {
      // Apply against the latest known results, then advance using that snapshot.
      // Do not rely on setState updater side effects for the preview list.
      const previewResults = applyRunAction(
        { ...runState, results: optimisticRun.results },
        action,
      ).results;
      setRunState((current) => applyRunAction(current, action));
      advanceAfterStatus(
        previewResults,
        result.id,
        action.status ?? result.status,
      );
      setStatusRetry(null);
      const saved = await patch(body, undefined, true, {
        trackNotesFailure: false,
        silentError: true,
      });
      if (saved) return;
      setStatusRetry({
        resultId: result.id,
        caseId: result.case.id,
        status: String(body.status ?? action.status ?? result.status),
        notes: String(body.notes ?? result.notes),
        durationMs:
          typeof body.durationMs === "number" ? body.durationMs : undefined,
        step: action.step,
        message: "Could not save result status. Retry without leaving the run.",
      });
    },
    [advanceAfterStatus, optimisticRun.results, runState],
  );

  const recordStatus = useCallback(
    async (result: ResultRow, status: string, durationMs?: number) => {
      if (!can("runs.edit")) return;
      const notes = notesDraft[result.id] ?? result.notes;
      const body: Record<string, unknown> = {
        caseId: result.case.id,
        resultId: result.id,
        status,
        notes,
      };
      if (durationMs != null && durationMs > 0) body.durationMs = durationMs;
      await persistResultStatus(
        result,
        {
          type: "result",
          resultId: result.id,
          status,
          durationMs: durationMs != null && durationMs > 0 ? durationMs : undefined,
        },
        body,
      );
    },
    [can, notesDraft, persistResultStatus],
  );

  const retryFailedStatus = useCallback(async () => {
    if (!statusRetry) return;
    const retry = statusRetry;
    const body: Record<string, unknown> = {
      caseId: retry.caseId,
      resultId: retry.resultId,
      status: retry.status,
      notes: retry.notes,
    };
    if (retry.durationMs != null && retry.durationMs > 0) {
      body.durationMs = retry.durationMs;
    }
    if (retry.step) body.stepResults = [retry.step];
    setStatusRetry(null);
    setError(null);
    const saved = await patch(body, undefined, true, {
      trackNotesFailure: false,
      silentError: true,
    });
    if (!saved) {
      setStatusRetry({
        ...retry,
        message: "Retry failed. Try again or reload if the problem continues.",
      });
    }
  }, [statusRetry]);

  async function bulkUpdateResults(patchBody: {
    status?: string;
    assigneeId?: string | null;
  }) {
    if (frozen || !can("runs.edit") || selectedIds.size === 0) return;
    const resultIds = Array.from(selectedIds);
    const ok = await patch(
      { action: "bulk_results", resultIds, ...patchBody },
      { type: "bulk_results", resultIds, ...patchBody },
    );
    if (ok) setSelectedIds(new Set());
  }

  useShortcut(
    "nav-next",
    useCallback(() => {
      setFocusedId((current) => neighborId(filtered, current, 1));
      setDetailOpen(true);
    }, [filtered]),
  );
  useShortcut(
    "nav-prev",
    useCallback(() => {
      setFocusedId((current) => neighborId(filtered, current, -1));
      setDetailOpen(true);
    }, [filtered]),
  );
  useShortcut(
    "open",
    useCallback(() => {
      if (focusedId) setDetailOpen(true);
    }, [focusedId]),
  );
  const timerMsOrUndefined = useCallback(() => {
    const ms = readTimerMs.current();
    return ms > 0 ? ms : undefined;
  }, []);

  useShortcut(
    "pass",
    useCallback(() => {
      if (focusedResult && !frozen) {
        void recordStatus(focusedResult, "passed", timerMsOrUndefined());
      }
    }, [focusedResult, frozen, recordStatus, timerMsOrUndefined]),
  );
  useShortcut(
    "fail",
    useCallback(() => {
      if (focusedResult && !frozen) {
        void recordStatus(focusedResult, "failed", timerMsOrUndefined());
      }
    }, [focusedResult, frozen, recordStatus, timerMsOrUndefined]),
  );
  useShortcut(
    "blocked",
    useCallback(() => {
      if (focusedResult && !frozen) {
        void recordStatus(focusedResult, "blocked", timerMsOrUndefined());
      }
    }, [focusedResult, frozen, recordStatus, timerMsOrUndefined]),
  );
  useShortcut(
    "skipped",
    useCallback(() => {
      if (focusedResult && !frozen) {
        void recordStatus(focusedResult, "skipped", timerMsOrUndefined());
      }
    }, [focusedResult, frozen, recordStatus, timerMsOrUndefined]),
  );
  useShortcut(
    "assign",
    useCallback(() => {
      const root = document.querySelector<HTMLElement>(
        `[data-result-id="${focusedResult?.id ?? ""}"] [data-assign]`,
      );
      root?.focus();
      if (root instanceof HTMLSelectElement) {
        try {
          root.showPicker?.();
        } catch {
          /* Keyboard arrows remain available. */
        }
      } else {
        root?.click();
      }
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

  async function confirmReopen() {
    const ok = await patch(
      { action: "reopen" },
      { type: "run", status: "in_progress" },
    );
    if (ok) reopenModal.close();
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
    uploadCounts.current[resultId] = (uploadCounts.current[resultId] ?? 0) + 1;
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
    uploadCounts.current[resultId] = Math.max(
      0,
      (uploadCounts.current[resultId] ?? 1) - 1,
    );
    if ((uploadCounts.current[resultId] ?? 0) === 0) {
      setUploadingId((current) => (current === resultId ? null : current));
    }
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

  const actionsRef = useRef({
    patch,
    recordStatus,
    persistResultStatus,
    postComment,
    uploadFile,
    issueAction,
    bulkUpdateResults,
    can,
    notesDraft,
    frozen,
    runStateId: runState.id,
  });
  useEffect(() => {
    actionsRef.current = {
      patch,
      recordStatus,
      persistResultStatus,
      postComment,
      uploadFile,
      issueAction,
      bulkUpdateResults,
      can,
      notesDraft,
      frozen,
      runStateId: runState.id,
    };
  });

  const selectCase = useCallback((resultId: string) => {
    setFocusedId(resultId);
    setDetailOpen(true);
  }, []);

  const onToggleSelected = useCallback((resultId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) next.delete(resultId);
      else next.add(resultId);
      return next;
    });
  }, []);

  const onSelectFiltered = useCallback(() => {
    setSelectedIds(new Set(filtered.map((row) => row.id)));
  }, [filtered]);

  const onClearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const onBulkStatus = useCallback((status: string) => {
    void actionsRef.current.bulkUpdateResults({ status });
  }, []);

  const onBulkAssignee = useCallback((assigneeId: string | null) => {
    void actionsRef.current.bulkUpdateResults({ assigneeId });
  }, []);

  const onDetailBack = useCallback(() => setDetailOpen(false), []);

  const onRecordStatus = useCallback(
    (status: string, durationMs?: number) => {
      if (!focusedResult) return;
      void actionsRef.current.recordStatus(focusedResult, status, durationMs);
    },
    [focusedResult],
  );

  const onStepStatus = useCallback(
    (position: number, status: string) => {
      if (!focusedResult || !actionsRef.current.can("runs.edit")) return;
      const rolled = rollupStepStatuses(
        (focusedResult.stepResults ?? []).map((step) =>
          step.position === position ? status : step.status,
        ),
      );
      void actionsRef.current.persistResultStatus(
        focusedResult,
        {
          type: "result",
          resultId: focusedResult.id,
          step: { position, status },
          status: rolled,
        },
        {
          caseId: focusedResult.case.id,
          resultId: focusedResult.id,
          stepResults: [{ position, status }],
          notes:
            actionsRef.current.notesDraft[focusedResult.id] ??
            focusedResult.notes,
        },
      );
    },
    [focusedResult],
  );

  const onAssign = useCallback(
    (assigneeId: string | null) => {
      if (!focusedResult) return;
      void actionsRef.current.patch(
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
    },
    [focusedResult],
  );

  const onNotesChange = useCallback(
    (value: string) => {
      if (!focusedResult) return;
      setNotesDraft((prev) => ({ ...prev, [focusedResult.id]: value }));
    },
    [focusedResult],
  );

  const onNotesBlur = useCallback(() => {
    if (!focusedResult || actionsRef.current.frozen) return;
    const next =
      actionsRef.current.notesDraft[focusedResult.id] ?? "";
    if (next === focusedResult.notes) {
      failedNoteSaves.current.delete(
        `${actionsRef.current.runStateId}:${focusedResult.id}`,
      );
      return;
    }
    void actionsRef.current.patch(
      {
        caseId: focusedResult.case.id,
        resultId: focusedResult.id,
        status: focusedResult.status,
        notes: next,
      },
      { type: "result", resultId: focusedResult.id, notes: next },
      true,
    );
  }, [focusedResult]);

  const onCommentDraftChange = useCallback(
    (value: string) => {
      if (!focusedResult) return;
      setCommentDraft((prev) => ({
        ...prev,
        [focusedResult.id]: value,
      }));
    },
    [focusedResult],
  );

  const onComment = useCallback(() => {
    if (focusedResult) void actionsRef.current.postComment(focusedResult.id);
  }, [focusedResult]);

  const onUpload = useCallback(
    (file: File | null) => {
      if (focusedResult) void actionsRef.current.uploadFile(focusedResult.id, file);
    },
    [focusedResult],
  );

  const onLinkKeyChange = useCallback(
    (value: string) => {
      if (!focusedResult) return;
      setLinkKey((prev) => ({ ...prev, [focusedResult.id]: value }));
    },
    [focusedResult],
  );

  const onIssueAction = useCallback((body: Record<string, unknown>) => {
    void actionsRef.current.issueAction(body);
  }, []);

  const onTimerReader = useCallback((readMs: () => number) => {
    readTimerMs.current = readMs;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Manual run"
        title={optimisticRun.name}
        description={optimisticRun.description || "Select a case, follow its steps, and record the result."}
        meta={
          <>
            <StatusChip tone={statusToneForRun(optimisticRun.status)} mono>
              {formatStatusLabel(optimisticRun.status)}
            </StatusChip>
            <StatusChip mono>
              {done}/{optimisticRun.results.length} ·{" "}
              {optimisticRun.results.length === 0
                ? 0
                : Math.round((done / optimisticRun.results.length) * 100)}
              %
            </StatusChip>

          </>
        }
        actions={
          <>
            {optimisticRun.status === "planned" ? (
              <Button
                size="sm"
                variant="primary"
                className="gap-1.5"
                isDisabled={pending || !can("runs.edit")}
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
                isDisabled={pending || !can("runs.complete")}
                onPress={() => completeModal.open()}
              >
                <CheckIcon size={14} weight="bold" aria-hidden />
                Complete
              </Button>
            ) : null}
            {showRetestInHeader && retestHref ? (
              <Link
                href={retestHref}
                className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)] transition active:scale-[0.98]"
              >
                <ArrowsClockwiseIcon size={14} weight="bold" aria-hidden />
                Retest {failureResults.length}{" "}
                {failureResults.length === 1 ? "failure" : "failures"}
              </Link>
            ) : null}
            {!frozen || canReopen || showRetestInMore ? (
              <Dropdown.Root>
                <Dropdown.Trigger className="button button--sm button--secondary inline-flex items-center gap-1.5 self-center">
                  <DotsThreeIcon size={14} weight="bold" aria-hidden />
                  More actions
                </Dropdown.Trigger>
                <Dropdown.Popover placement="bottom end" className="min-w-[12rem]">
                  <Dropdown.Menu
                    aria-label="More run actions"
                    onAction={(key) => {
                      if (key === "retest" && retestHref) {
                        router.push(retestHref);
                      } else if (key === "abort") {
                        abortModal.open();
                      } else if (key === "reopen") {
                        reopenModal.open();
                      }
                    }}
                  >
                    {showRetestInMore && retestHref ? (
                      <Dropdown.Item
                        id="retest"
                        textValue={`Retest ${failureResults.length} ${failureResults.length === 1 ? "failure" : "failures"}`}
                        className="gap-2"
                      >
                        <ArrowsClockwiseIcon size={14} weight="bold" aria-hidden />
                        Retest {failureResults.length}{" "}
                        {failureResults.length === 1 ? "failure" : "failures"}
                      </Dropdown.Item>
                    ) : null}
                    {!frozen ? (
                      <Dropdown.Item
                        id="abort"
                        textValue="Abort run"
                        variant="danger"
                        className="gap-2"
                        isDisabled={pending || !can("runs.delete")}
                      >
                        <StopIcon size={14} weight="bold" aria-hidden />
                        Abort run
                      </Dropdown.Item>
                    ) : null}
                    {canReopen ? (
                      <Dropdown.Item
                        id="reopen"
                        textValue="Reopen run"
                        className="gap-2"
                        isDisabled={pending || !can("runs.complete")}
                      >
                        <ArrowCounterClockwiseIcon size={14} weight="bold" aria-hidden />
                        Reopen run
                      </Dropdown.Item>
                    ) : null}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown.Root>
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
        <TopoSelect
          label="Run assignee"
          ariaLabel="Run assignee"
          name="run-assignee"
          className="w-48"
          value={optimisticRun.assigneeId ?? ""}
          isDisabled={pending || !can("runs.edit")}
          onChange={(value) =>
            void patch(
              {
                action: "assign",
                assigneeId: value || null,
              },
              { type: "run", assigneeId: value || null },
            )
          }
          options={[
            { id: "", label: "Unassigned" },
            ...members.map((member) => ({
              id: member.id,
              label: member.name ?? member.email,
            })),
          ]}
          compact
        />
      </div>

      <RunProgressBar
        labeled
        passed={statusCounts.passed}
        failed={statusCounts.failed}
        skipped={statusCounts.skipped}
        blocked={statusCounts.blocked}
        untested={statusCounts.untested}
        total={optimisticRun.results.length}
      />
      {liveStatus !== "live" ? <p role="status" className="text-xs text-[color:var(--topo-muted)]">{liveStatus === "reconnecting" ? "Reconnecting — results may be out of date" : "Connecting to live updates…"}</p> : null}

      {statusRetry ? (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          <span>{statusRetry.message}</span>
          <Button
            type="button"
            className="rounded-md border border-red-500/40 px-2 py-0.5 text-xs font-medium hover:bg-red-500/10"
            onPress={() => void retryFailedStatus()}
          >
            Retry
          </Button>
          <Button
            type="button"
            className="text-xs underline-offset-2 hover:underline"
            onPress={() => setStatusRetry(null)}
          >
            Dismiss
          </Button>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="grid h-[min(44rem,calc(100dvh-13rem))] min-h-[20rem] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <aside
          className={`min-h-0 overflow-hidden border-[color:var(--topo-line)] md:flex md:flex-col md:border-r ${
            detailOpen ? "hidden" : "flex flex-col"
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
            statusCounts={statusCounts}
            mineCount={mineCount}
            selectedIds={selectedIds}
            selectionEnabled={!frozen && can("runs.edit")}
            bulkPending={pending}
            onStatusFilter={setStatusFilter}
            onMineOnly={setMineOnly}
            onQueryChange={setQuery}
            onSelect={selectCase}
            onToggleSelected={onToggleSelected}
            onSelectFiltered={onSelectFiltered}
            onClearSelection={onClearSelection}
            onBulkStatus={onBulkStatus}
            onBulkAssignee={onBulkAssignee}
          />
        </aside>
        <section
          className={`min-h-0 overflow-hidden md:flex md:flex-col ${
            detailOpen ? "flex flex-col" : "hidden"
          }`}
        >
          <RunCaseDetail
            result={focusedResult}
            members={members}
            frozen={frozen || !can("runs.edit")}
            pending={pending || !can("runs.edit")}
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
            defaultProvider={defaultProvider}
            availableProviders={issueProviders}
            runName={optimisticRun.name}
            runId={optimisticRun.id}
            environment={optimisticRun.environment}
            onBack={onDetailBack}
            onRecordStatus={onRecordStatus}
            onStepStatus={onStepStatus}
            onAssign={onAssign}
            onNotesChange={onNotesChange}
            onNotesBlur={onNotesBlur}
            onCommentDraftChange={onCommentDraftChange}
            onComment={onComment}
            onUpload={onUpload}
            onLinkKeyChange={onLinkKeyChange}
            onIssueAction={onIssueAction}
            onTimerReader={onTimerReader}
          />
        </section>
      </div>

      <Modal.Backdrop isOpen={abortModal.isOpen} onOpenChange={abortModal.setOpen} isDismissable={!pending}>
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
                  isDisabled={pending || !can("runs.delete")}
                  onPress={() => void confirmAbort()}
                >
                  {pending ? "Aborting…" : "Abort run"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>


      <Modal.Backdrop isOpen={completeModal.isOpen} onOpenChange={completeModal.setOpen} isDismissable={!pending}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  Complete this run?
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  Completing locks results and case structure. You can still add
                  comments and attachments afterward, and admins can reopen the
                  run if needed.
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
                  isDisabled={pending || !can("runs.complete")}
                  onPress={() => void confirmComplete()}
                >
                  {pending ? "Completing…" : "Complete run"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>

      <Modal.Backdrop isOpen={reopenModal.isOpen} onOpenChange={reopenModal.setOpen} isDismissable={!pending}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="outline-none">
              <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
                <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                  Reopen this run?
                </Modal.Heading>
                <p className="text-sm text-[color:var(--topo-muted)]">
                  {RUN_REOPEN_MESSAGE}
                </p>
              </Modal.Header>
              <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
                <Button
                  variant="tertiary"
                  isDisabled={pending}
                  onPress={() => reopenModal.close()}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  isDisabled={pending || !can("runs.complete")}
                  onPress={() => void confirmReopen()}
                >
                  {pending ? "Reopening…" : "Reopen run"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>

      <RunProductivityActions run={runState} />
    </div>
  );
}
