"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, useOverlayState } from "@heroui/react";
import type { AttachmentRow, LinkedIssue } from "./run-executor-model";

const FALLBACK_PROVIDERS = ["mock"];

function buildPreviewDescription(ctx: {
  caseKey?: string;
  caseTitle?: string;
  resultStatus?: string;
  notes?: string;
  runName?: string;
  runId?: string;
  environment?: string;
}): string {
  const lines = [
    "## Failure context",
    "",
    ctx.caseKey ? `- Case: \`${ctx.caseKey}\` — ${ctx.caseTitle ?? ""}` : null,
    ctx.resultStatus ? `- Result: **${ctx.resultStatus}**` : null,
    ctx.runName
      ? `- Run: ${ctx.runName}${ctx.runId ? ` (\`${ctx.runId}\`)` : ""}`
      : null,
    ctx.environment ? `- Environment: ${ctx.environment}` : null,
    "",
    "### Notes",
    ctx.notes?.trim() || "_No notes_",
    "",
    "_Filed from Topology_",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

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
  defaultProvider = "mock",
  availableProviders = FALLBACK_PROVIDERS,
  caseKey,
  caseTitle,
  notes = "",
  attachments = [],
  runName,
  runId,
  environment,
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
  defaultProvider?: string;
  availableProviders?: string[];
  caseKey?: string;
  caseTitle?: string;
  notes?: string;
  attachments?: AttachmentRow[];
  runName?: string;
  runId?: string;
  environment?: string;
}) {
  const providers =
    availableProviders.length > 0 ? availableProviders : FALLBACK_PROVIDERS;
  const resolvedDefault = providers.includes(defaultProvider)
    ? defaultProvider
    : providers[0]!;
  const [providerOverride, setProviderOverride] = useState<string | null>(null);
  const provider =
    providerOverride && providers.includes(providerOverride)
      ? providerOverride
      : resolvedDefault;
  const preview = useOverlayState();
  const defaultTitle = useMemo(
    () => `[${caseKey ?? "CASE"}] ${caseTitle ?? "Untitled"} — ${status}`,
    [caseKey, caseTitle, status],
  );
  const defaultDescription = useMemo(
    () =>
      buildPreviewDescription({
        caseKey,
        caseTitle,
        resultStatus: status,
        notes,
        runName,
        runId,
        environment,
      }),
    [caseKey, caseTitle, environment, notes, runId, runName, status],
  );
  const [draftTitle, setDraftTitle] = useState(defaultTitle);
  const [draftDescription, setDraftDescription] = useState(defaultDescription);

  function openPreview() {
    setDraftTitle(defaultTitle);
    setDraftDescription(defaultDescription);
    preview.open();
  }

  function submitCreate() {
    void onIssueAction({
      action: "create",
      resultId,
      provider,
      title: draftTitle.trim() || defaultTitle,
      description: draftDescription.trim() || defaultDescription,
    });
    preview.close();
  }

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
          {providers.length > 1 ? (
            <label className="flex items-center gap-1 text-xs text-[color:var(--topo-muted)]">
              Provider
              <select
                aria-label="Issue provider"
                value={provider}
                disabled={issueBusy}
                onChange={(e) => setProviderOverride(e.target.value)}
                className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs capitalize text-[color:var(--topo-ink)] accent-[color:var(--topo-accent)]"
              >
                {providers.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            disabled={issueBusy}
            onClick={openPreview}
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
                  provider,
                })
              }
            >
              Link
            </Button>
          </div>
        </>
      ) : null}

      <Drawer.Backdrop
        isOpen={preview.isOpen}
        onOpenChange={preview.setOpen}
        isDismissable={!issueBusy}
      >
        <Drawer.Content
          placement="right"
          className="w-[min(28rem,100vw)] border-l border-[color:var(--topo-line)]"
        >
          <Drawer.Dialog className="outline-none">
            <Drawer.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
              <Drawer.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                Preview defect
              </Drawer.Heading>
              <p className="text-sm text-[color:var(--topo-muted)]">
                Edit the title and description before filing to {provider}.
              </p>
            </Drawer.Header>
            <Drawer.Body className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              <label className="block space-y-1 text-xs">
                <span className="text-[color:var(--topo-muted)]">Title</span>
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-[color:var(--topo-muted)]">Description</span>
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={14}
                  className="w-full resize-y rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 font-mono text-xs"
                />
              </label>
              {attachments.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-[color:var(--topo-muted)]">
                    Attachments on this result ({attachments.length}) — linked from
                    Topology after filing
                  </p>
                  <ul className="space-y-1">
                    {attachments.map((attachment) => (
                      <li
                        key={attachment.id}
                        className="truncate font-mono text-xs text-[color:var(--topo-ink)]"
                      >
                        {attachment.filename}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Drawer.Body>
            <Drawer.Footer className="flex justify-end gap-2 border-t border-[color:var(--topo-line)] px-4 py-3">
              <Button
                variant="tertiary"
                isDisabled={issueBusy}
                onPress={() => preview.close()}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={issueBusy || !draftTitle.trim()}
                onPress={submitCreate}
              >
                {issueBusy ? "Creating…" : "Create issue"}
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}
