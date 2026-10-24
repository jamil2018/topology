"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react";
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
  onBack: () => void;
  onRecordStatus: (status: string) => void;
  onStepStatus: (position: number, status: string) => void;
  onAssign: (assigneeId: string | null) => void;
  onNotesChange: (value: string) => void;
  onNotesBlur: () => void;
  onCommentDraftChange: (value: string) => void;
  onComment: () => void;
  onUpload: (file: File | null) => void;
  onLinkKeyChange: (value: string) => void;
  onIssueAction: (body: Record<string, unknown>) => void;
}) {
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
          <p className="mt-0.5 text-[11px] text-[color:var(--topo-muted)]">
            {assignee ?? "Unassigned"}
          </p>
        </div>
        <ResultStatusButtons
          caseKey={result.case.key}
          value={result.status}
          disabled={pending || frozen}
          onChange={onRecordStatus}
        />
      </div>

      {result.iterationValuesJson ? (
        <p className="mt-2 font-mono text-[11px] text-[color:var(--topo-muted)]">
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
                  <p className="mt-0.5 text-[11px] text-[color:var(--topo-muted)]">
                    Expected: {step.expected}
                  </p>
                ) : null}
                {step.data ? (
                  <p className="font-mono text-[11px] text-[color:var(--topo-muted)]">
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
            <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] p-2.5 font-mono text-[11px] text-[color:var(--topo-muted)]">
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
          onLinkKeyChange={onLinkKeyChange}
          onIssueAction={onIssueAction}
        />
      </div>

      <label className="mt-3 block space-y-1 text-xs">
        <span className="text-[color:var(--topo-muted)]">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          onBlur={onNotesBlur}
          rows={3}
          readOnly={frozen}
          disabled={frozen}
          className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm disabled:opacity-70"
          placeholder="Optional notes for this result"
        />
      </label>

      <div className="mt-3">
        <RunCommentsPanel
          comments={result.comments}
          draft={commentDraft}
          pending={pending}
          onDraftChange={onCommentDraftChange}
          onSubmit={onComment}
        />
      </div>

      <div className="mt-3">
        <RunAttachmentsPanel
          attachments={result.attachments}
          uploading={uploading}
          pending={pending}
          onUpload={onUpload}
        />
      </div>
    </article>
  );
}
