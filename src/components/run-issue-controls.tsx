"use client";

import { Button } from "@heroui/react";
import type { LinkedIssue } from "./run-executor-model";

function IssueChip({
  issue,
  onRefresh,
  onAckRetest,
  onMarkClosed,
  pending,
}: {
  issue: LinkedIssue;
  onRefresh: () => void;
  onAckRetest: () => void;
  onMarkClosed: () => void;
  pending: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)]/80 px-2 py-1 text-xs">
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
      {issue.remoteStatus !== "done" ? (
        <button
          type="button"
          disabled={pending}
          onClick={onMarkClosed}
          title="Mark closed locally when provider sync is unavailable"
          className="text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
        >
          Mark closed
        </button>
      ) : null}
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

export function RunIssueControls({
  resultId,
  status,
  issues,
  frozen,
  pending,
  issueBusy,
  linkKey,
  onLinkKeyChange,
  onIssueAction,
}: {
  resultId: string;
  status: string;
  issues: LinkedIssue[];
  frozen: boolean;
  pending: boolean;
  issueBusy: boolean;
  linkKey: string;
  onLinkKeyChange: (value: string) => void;
  onIssueAction: (body: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {issues.map((issue) => (
        <IssueChip
          key={issue.id}
          issue={issue}
          pending={pending}
          onRefresh={() =>
            void onIssueAction({ action: "refresh", issueId: issue.id })
          }
          onMarkClosed={() =>
            void onIssueAction({
              action: "mark_closed",
              issueId: issue.id,
            })
          }
          onAckRetest={() =>
            void onIssueAction({
              action: "ack_retest",
              issueId: issue.id,
            })
          }
        />
      ))}
      {(status === "failed" || status === "blocked") && !frozen ? (
        <>
          <button
            type="button"
            disabled={issueBusy}
            onClick={() =>
              void onIssueAction({
                action: "create",
                resultId,
                provider: "mock",
              })
            }
            className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-2 py-1 text-xs font-medium text-[color:var(--topo-ink)] disabled:opacity-50"
          >
            Create issue
          </button>
          <div className="flex items-center gap-1">
            <input
              value={linkKey}
              onChange={(e) => onLinkKeyChange(e.target.value)}
              placeholder="Link key (MOCK-1)"
              className="w-36 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              isDisabled={issueBusy || !linkKey.trim()}
              onPress={() =>
                void onIssueAction({
                  action: "link",
                  resultId,
                  remoteKey: linkKey.trim(),
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
  );
}
