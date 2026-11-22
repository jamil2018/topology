"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, Input, Label, TextArea, TextField, useOverlayState } from "@heroui/react";
import type { AttachmentRow, LinkedIssue } from "./run-executor-model";
import { TopoSelect } from "./ui/topo-select";

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
      <Button
        type="button"
        variant="ghost"
        isDisabled={pending}
        onPress={onRefresh}
        className="text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
      >
        Sync
      </Button>
      {issue.remoteStatus !== "done" ? (
        <Button
          type="button"
          variant="ghost"
          isDisabled={pending}
          onPress={onMarkClosed}
          aria-label="Mark closed locally when provider sync is unavailable"
          className="text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
        >
          Mark closed
        </Button>
      ) : null}
      {issue.needsRetest === 1 && issue.remoteStatus === "done" ? (
        <Button
          type="button"
          variant="ghost"
          isDisabled={pending}
          onPress={onAckRetest}
          className="rounded bg-[color:var(--topo-signal)]/15 px-1.5 py-0.5 font-medium text-[color:var(--topo-signal)]"
        >
          Retest ready
        </Button>
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
            <TopoSelect
              label="Provider"
              ariaLabel="Issue provider"
              className="w-32"
              value={provider}
              isDisabled={issueBusy}
              onChange={setProviderOverride}
              valueClassName="capitalize"
              options={providers.map((id) => ({
                id,
                label: id,
              }))}
              compact
            />
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isDisabled={issueBusy}
            onPress={openPreview}
          >
            Create issue
          </Button>
          <div className="flex items-center gap-1">
            <TextField name="link-key" className="w-36" variant="secondary" aria-label="Link key">
              <Input
                value={linkKey}
                onChange={(e) => onLinkKeyChange(e.target.value)}
                placeholder="Link key (MOCK-1)"
                className="font-mono text-xs"
              />
            </TextField>
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
              <TextField name="issue-title" className="w-full" variant="secondary">
                <Label className="text-xs text-[color:var(--topo-muted)]">Title</Label>
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full"
                />
              </TextField>
              <TextField name="issue-description" className="w-full" variant="secondary">
                <Label className="text-xs text-[color:var(--topo-muted)]">Description</Label>
                <TextArea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={14}
                  className="w-full resize-y font-mono text-xs"
                />
              </TextField>
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
