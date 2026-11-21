"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { ArrowLeftIcon, PauseIcon, PlayIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { formatDuration } from "@/lib/report-stats";
import { formatStatusLabel } from "@/lib/format-labels";
import {
  RESULT_STATUSES,
  memberLabel,
  type MemberOption,
  type ResultRow,
} from "./run-executor-model";
import { statusButtonClass } from "./run-status-styles";
import { RunIssueControls } from "./run-issue-controls";
import {
  RunAttachmentsPanel,
  RunCommentsPanel,
} from "./run-comments-panel";
import {
  imageFilesFromDataTransfer,
  pendingUploadFromFile,
  revokePendingUploads,
  type PendingUpload,
} from "./run-paste-upload";

function ResultStatusButtons({
  caseKey,
  value,
  disabled,
  onChange,
  stepPosition,
}: {
  caseKey: string;
  value: string;
  disabled: boolean;
  onChange: (status: string) => void;
  stepPosition?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {RESULT_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          disabled={disabled}
          aria-label={
            stepPosition !== undefined
              ? `Mark step ${stepPosition + 1} of ${caseKey} as ${status}`
              : `Mark ${caseKey} as ${status}`
          }
          aria-pressed={value === status}
          onClick={() => onChange(status)}
          className={statusButtonClass(status, value === status, disabled)}
        >
          {formatStatusLabel(status)}
        </button>
      ))}
    </div>
  );
}

function useResultTimer(resultId: string | null) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAt = useRef<number | null>(null);
  const baseMs = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    setElapsedMs(0);
    setRunning(false);
    runningRef.current = false;
    startedAt.current = null;
    baseMs.current = 0;
  }, [resultId]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (startedAt.current == null) return;
      setElapsedMs(baseMs.current + (performance.now() - startedAt.current));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    startedAt.current = performance.now();
    runningRef.current = true;
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    if (!runningRef.current || startedAt.current == null) return;
    baseMs.current += performance.now() - startedAt.current;
    startedAt.current = null;
    setElapsedMs(baseMs.current);
    runningRef.current = false;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    startedAt.current = null;
    baseMs.current = 0;
    setElapsedMs(0);
    runningRef.current = false;
    setRunning(false);
  }, []);

  const readMs = useCallback(() => {
    if (runningRef.current && startedAt.current != null) {
      return Math.round(baseMs.current + (performance.now() - startedAt.current));
    }
    return Math.round(baseMs.current || elapsedMs);
  }, [elapsedMs]);

  return { elapsedMs, running, start, pause, reset, readMs };
}

export function RunCaseDetail({
  result,
  members,
  frozen,
  pending,
  issueBusy,
  uploading,
  notes,
  commentDraft,
  linkKey,
  defaultProvider = "mock",
  availableProviders,
  onBack,
  onRecordStatus,
  onStepStatus,
  onAssign,
  onNotesChange,
  onNotesBlur,
  onCommentDraftChange,
  onComment,
  onUpload,
  onLinkKeyChange,
  onIssueAction,
  onTimerReader,
  runName,
  runId,
  environment,
}: {
  result: ResultRow | null;
  members: MemberOption[];
  frozen: boolean;
  pending: boolean;
  issueBusy: boolean;
  uploading: boolean;
  notes: string;
  commentDraft: string;
  linkKey: string;
  defaultProvider?: string;
  availableProviders?: string[];
  onBack: () => void;
  onRecordStatus: (status: string, durationMs?: number) => void;
  onStepStatus: (position: number, status: string) => void;
  onAssign: (assigneeId: string | null) => void;
  onNotesChange: (value: string) => void;
  onNotesBlur: () => void;
  onCommentDraftChange: (value: string) => void;
  onComment: () => void;
  onUpload: (file: File | null) => void;
  onLinkKeyChange: (value: string) => void;
  onIssueAction: (body: Record<string, unknown>) => void;
  onTimerReader?: (readMs: () => number) => void;
  runName?: string;
  runId?: string;
  environment?: string;
}) {
  const [dropActive, setDropActive] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const timer = useResultTimer(result?.id ?? null);
  const autoStartEligible =
    Boolean(result) && !frozen && result?.status === "untested";

  useEffect(() => {
    onTimerReader?.(timer.readMs);
  }, [onTimerReader, timer.readMs]);

  const { start: startTimer, pause: pauseTimer } = timer;
  useEffect(() => {
    if (!autoStartEligible) return;
    startTimer();
    const pauseForBackground = () => {
      if (document.hidden) pauseTimer();
      else startTimer();
    };
    const pauseForWindowBlur = () => pauseTimer();
    const resumeForWindowFocus = () => {
      if (!document.hidden) startTimer();
    };
    document.addEventListener("visibilitychange", pauseForBackground);
    window.addEventListener("blur", pauseForWindowBlur);
    window.addEventListener("focus", resumeForWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", pauseForBackground);
      window.removeEventListener("blur", pauseForWindowBlur);
      window.removeEventListener("focus", resumeForWindowFocus);
      pauseTimer();
    };
  }, [autoStartEligible, result?.id, startTimer, pauseTimer]);

  useEffect(() => {
    return () => revokePendingUploads(pendingUploads);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

  useEffect(() => {
    if (!uploading && pendingUploads.length > 0) {
      revokePendingUploads(pendingUploads);
      setPendingUploads([]);
    }
  }, [uploading, pendingUploads]);

  const queueUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const next = files.map(pendingUploadFromFile);
      setPendingUploads((prev) => [...prev, ...next]);
      for (const file of files) onUpload(file);
    },
    [onUpload],
  );

  const onPasteNotes = useCallback(
    (event: ClipboardEvent) => {
      const files = imageFilesFromDataTransfer(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      queueUpload(files);
    },
    [queueUpload],
  );

  if (!result) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10 text-sm text-[color:var(--topo-muted)]">
        Select a case to record a result.
      </div>
    );
  }

  const assignee = memberLabel(members, result.assigneeId);

  return (
    <article data-result-id={result.id} className="min-h-0 flex-1 overflow-y-auto p-3">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-xs text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)] md:hidden"
      >
        <ArrowLeftIcon size={14} weight="bold" aria-hidden />
        Back to case list
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-[color:var(--topo-muted)]">
            {result.case.key}
          </div>
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            {result.case.title}
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
            {assignee ?? "Unassigned"}
          </p>
        </div>
        <ResultStatusButtons
          caseKey={result.case.key}
          value={result.status}
          disabled={pending || frozen}
          onChange={(status) => {
            const ms = timer.readMs();
            onRecordStatus(status, ms > 0 ? ms : undefined);
            if (ms > 0) timer.pause();
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] px-2.5 py-2">
        <span className="text-xs text-[color:var(--topo-muted)]">Timer</span>
        <span
          className="font-mono text-sm tabular-nums text-[color:var(--topo-ink)]"
          aria-live="polite"
        >
          {formatDuration(Math.round(timer.elapsedMs))}
        </span>
        {result.durationMs != null && result.durationMs > 0 ? (
          <span className="text-xs text-[color:var(--topo-muted)]">
            last {formatDuration(result.durationMs)}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-1">
          {timer.running ? (
            <button
              type="button"
              disabled={frozen}
              onClick={timer.pause}
              className="inline-flex items-center gap-1 rounded-md border border-[color:var(--topo-line)] px-2 py-1 text-xs text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-chip)]/50 disabled:opacity-50"
            >
              <PauseIcon size={12} weight="bold" aria-hidden />
              Pause timer
            </button>
          ) : (
            <button
              type="button"
              disabled={frozen}
              onClick={timer.start}
              className="inline-flex items-center gap-1 rounded-md border border-[color:var(--topo-line)] px-2 py-1 text-xs text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-chip)]/50 disabled:opacity-50"
            >
              <PlayIcon size={12} weight="bold" aria-hidden />
              Start timer
            </button>
          )}
          <button
            type="button"
            disabled={frozen || (timer.elapsedMs === 0 && !timer.running)}
            onClick={timer.reset}
            className="inline-flex items-center gap-1 rounded-md border border-[color:var(--topo-line)] px-2 py-1 text-xs text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)] disabled:opacity-50"
          >
            <ArrowCounterClockwiseIcon size={12} weight="bold" aria-hidden />
            Reset timer
          </button>
        </div>
      </div>

      {result.iterationValuesJson ? (
        <p className="mt-2 font-mono text-xs text-[color:var(--topo-muted)]">
          Iteration {result.iterationIndex ?? 0}: {result.iterationValuesJson}
        </p>
      ) : null}

      {result.stepResults && result.stepResults.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {[...result.stepResults]
            .sort((a, b) => a.position - b.position)
            .map((step) => (
              <li
                key={step.id}
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] p-2"
              >
                <p className="text-xs font-medium text-[color:var(--topo-ink)]">
                  {step.position + 1}. {step.action}
                </p>
                {step.expected ? (
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    Expected: {step.expected}
                  </p>
                ) : null}
                {step.data ? (
                  <p className="font-mono text-xs text-[color:var(--topo-muted)]">
                    Data: {step.data}
                  </p>
                ) : null}
                <div className="mt-1.5">
                  <ResultStatusButtons
                    caseKey={result.case.key}
                    value={step.status}
                    disabled={pending || frozen}
                    stepPosition={step.position}
                    onChange={(status) => onStepStatus(step.position, status)}
                  />
                </div>
              </li>
            ))}
        </ol>
      ) : (
        <>
          {result.case.steps ? (
            <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] p-2.5 font-mono text-xs text-[color:var(--topo-muted)]">
              {result.case.steps}
            </pre>
          ) : null}
          {result.case.expectedResult ? (
            <p className="mt-2 text-xs text-[color:var(--topo-muted)]">
              Expected: {result.case.expectedResult}
            </p>
          ) : null}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-[color:var(--topo-muted)]">
          Assign
          <select
            data-assign
            className="ml-2 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs text-[color:var(--topo-ink)] accent-[color:var(--topo-accent)]"
            value={result.assigneeId ?? ""}
            disabled={pending}
            onChange={(e) => onAssign(e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name ?? member.email}
              </option>
            ))}
          </select>
        </label>
        <RunIssueControls
          resultId={result.id}
          status={result.status}
          issues={result.linkedIssues}
          frozen={frozen}
          pending={pending}
          issueBusy={issueBusy}
          linkKey={linkKey}
          defaultProvider={defaultProvider}
          availableProviders={availableProviders}
          onLinkKeyChange={onLinkKeyChange}
          onIssueAction={onIssueAction}
          caseKey={result.case.key}
          caseTitle={result.case.title}
          notes={notes}
          attachments={result.attachments}
          runName={runName}
          runId={runId}
          environment={environment}
        />
      </div>

      <div
        className={`mt-3 space-y-3 rounded-md ${
          dropActive
            ? "outline outline-2 outline-[color:var(--topo-accent)] outline-offset-2"
            : ""
        }`}
        onDragEnter={(e: DragEvent) => {
          if ([...e.dataTransfer.types].includes("Files")) setDropActive(true);
        }}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDropActive(false);
          queueUpload(imageFilesFromDataTransfer(e.dataTransfer));
        }}
      >
        <label className="block space-y-1 text-xs">
          <span className="text-[color:var(--topo-muted)]">
            Notes — paste or drop screenshots
          </span>
          <textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            onBlur={onNotesBlur}
            onPaste={onPasteNotes}
            rows={3}
            readOnly={frozen}
            disabled={frozen}
            className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm disabled:opacity-70"
            placeholder="Optional notes for this result"
          />
        </label>

        {dropActive ? (
          <p className="text-xs text-[color:var(--topo-accent)]">
            Drop image to attach as evidence
          </p>
        ) : null}

        <RunCommentsPanel
          comments={result.comments}
          draft={commentDraft}
          pending={pending}
          onDraftChange={onCommentDraftChange}
          onSubmit={onComment}
          onUpload={(file) => queueUpload([file])}
        />

        <RunAttachmentsPanel
          attachments={result.attachments}
          uploading={uploading}
          pending={pending}
          pendingUploads={pendingUploads}
          onUpload={(file) => {
            if (file) queueUpload([file]);
            else onUpload(file);
          }}
        />
      </div>
    </article>
  );
}
