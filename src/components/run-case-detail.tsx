"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { Button, Description, Label, TextArea, TextField } from "@heroui/react";
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
import { TopoSelect } from "./ui/topo-select";
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

export const RunCaseDetail = memo(function RunCaseDetail({
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
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-sm text-[color:var(--topo-muted)]">
        Select a case to record a result.
      </div>
    );
  }

  const assignee = memberLabel(members, result.assigneeId);
  const sortedSteps =
    result.stepResults && result.stepResults.length > 0
      ? [...result.stepResults].sort((a, b) => a.position - b.position)
      : null;

  return (
    <article
      data-result-id={result.id}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <header className="shrink-0 space-y-3 border-b border-[color:var(--topo-line)] p-3">
        <Button
          type="button"
          variant="ghost"
          onPress={onBack}
          className="inline-flex h-auto min-h-0 items-center gap-1 px-0 py-0 text-xs text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)] md:hidden"
        >
          <ArrowLeftIcon size={14} weight="bold" aria-hidden />
          Back to case list
        </Button>

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

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] px-2.5 py-2">
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
              <Button
                type="button"
                size="sm"
                variant="secondary"
                isDisabled={frozen}
                onPress={timer.pause}
                className="inline-flex items-center gap-1"
              >
                <PauseIcon size={12} weight="bold" aria-hidden />
                Pause timer
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                isDisabled={frozen}
                onPress={timer.start}
                className="inline-flex items-center gap-1"
              >
                <PlayIcon size={12} weight="bold" aria-hidden />
                Start timer
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="tertiary"
              isDisabled={frozen || (timer.elapsedMs === 0 && !timer.running)}
              onPress={timer.reset}
              className="inline-flex items-center gap-1"
            >
              <ArrowCounterClockwiseIcon size={12} weight="bold" aria-hidden />
              Reset timer
            </Button>
          </div>
        </div>

        {result.iterationValuesJson ? (
          <p className="font-mono text-xs text-[color:var(--topo-muted)]">
            Iteration {result.iterationIndex ?? 0}: {result.iterationValuesJson}
          </p>
        ) : null}
      </header>

      {/*
        Narrow: one vertical stack (steps → fields) with a single scroll owner.
        Wide: steps | sidebar; each column scrolls independently so Assign/Notes stay reachable.
      */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="min-w-0 flex-1 space-y-2 p-3 lg:min-h-0 lg:overflow-y-auto">
          {sortedSteps ? (
            <ol className="space-y-2">
              {sortedSteps.map((step) => (
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
                <pre className="whitespace-pre-wrap rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] p-2.5 font-mono text-xs text-[color:var(--topo-muted)]">
                  {result.case.steps}
                </pre>
              ) : null}
              {result.case.expectedResult ? (
                <p className="text-xs text-[color:var(--topo-muted)]">
                  Expected: {result.case.expectedResult}
                </p>
              ) : null}
            </>
          )}
        </div>

        <aside
          className={`shrink-0 space-y-3 border-t border-[color:var(--topo-line)] p-3 lg:w-[18rem] lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l xl:w-[20rem] ${
            dropActive
              ? "outline outline-2 outline-[color:var(--topo-accent)] outline-offset-[-2px]"
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
          <TopoSelect
            label="Assign"
            ariaLabel="Assign"
            className="w-full"
            value={result.assigneeId ?? ""}
            isDisabled={pending}
            onChange={(value) => onAssign(value || null)}
            triggerProps={{ "data-assign": true }}
            options={[
              { id: "", label: "Unassigned" },
              ...members.map((member) => ({
                id: member.id,
                label: member.name ?? member.email,
              })),
            ]}
            compact
          />

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

          <TextField
            name="result-notes"
            className="w-full"
            variant="secondary"
            isReadOnly={frozen}
            isDisabled={frozen}
          >
            <Label className="text-xs text-[color:var(--topo-muted)]">Notes</Label>
            <Description className="text-xs text-[color:var(--topo-muted)]">
              Paste or drop screenshots
            </Description>
            <TextArea
              aria-label="Notes"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              onBlur={onNotesBlur}
              onPaste={onPasteNotes}
              rows={4}
              className="w-full"
              placeholder="Optional notes for this result"
            />
          </TextField>

          {dropActive ? (
            <p className="text-xs text-[color:var(--topo-accent)]">
              Drop image to attach as evidence
            </p>
          ) : null}

          <RunCommentsPanel
            comments={result.comments}
            draft={commentDraft}
            pending={pending}
            members={members}
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
        </aside>
      </div>
    </article>
  );
});
