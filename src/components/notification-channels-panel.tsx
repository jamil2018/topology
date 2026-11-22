"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { TopoCheckbox } from "./ui/topo-checkbox";
import { StatusChip } from "./status-chip";
import { TopoSelect } from "./ui/topo-select";
import { useMutationFeedback } from "./use-mutation-feedback";
import { useProjectActions } from "./project-actions";

const CHANNEL_EVENTS = [
  "assignment",
  "mention",
  "run.completed",
  "coverage.dropped",
  "proposal.created",
  "issue.created",
] as const;

type ChannelEvent = (typeof CHANNEL_EVENTS)[number];
type ChannelKind = "slack" | "teams" | "smtp";

type Channel = {
  id: string;
  kind: ChannelKind;
  name: string;
  events: string;
  enabled: number;
  hasConfig?: boolean;
  config?: Record<string, unknown>;
};

function parseEventList(raw: string): Set<ChannelEvent> {
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim())
      .filter((e): e is ChannelEvent =>
        (CHANNEL_EVENTS as readonly string[]).includes(e),
      ),
  );
}

const emptyDraft = {
  kind: "slack" as ChannelKind,
  name: "",
  url: "",
  host: "",
  port: "587",
  secure: false,
  user: "",
  pass: "",
  from: "",
  to: "",
  events: new Set<ChannelEvent>([
    "assignment",
    "mention",
    "run.completed",
    "coverage.dropped",
    "proposal.created",
    "issue.created",
  ]),
};

export function NotificationChannelsPanel() {
  const { can } = useProjectActions();
  const canManage = can("webhooks.manage");
  const [pending, startTransition] = useTransition();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [envSmtp, setEnvSmtp] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { saving, submit } = useMutationFeedback(setError);
  const busy = pending || saving;

  async function load() {
    const res = await fetch("/api/notification-channels");
    if (!res.ok) throw new Error("Failed to load notification channels");
    const data = (await res.json()) as {
      channels: Channel[];
      envSmtpConfigured: boolean;
    };
    setChannels(data.channels);
    setEnvSmtp(data.envSmtpConfigured);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, []);

  function toggleDraftEvent(event: ChannelEvent) {
    setDraft((prev) => {
      const next = new Set(prev.events);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return { ...prev, events: next };
    });
  }

  function startEdit(channel: Channel) {
    setEditingId(channel.id);
    setMsg(null);
    const cfg = channel.config ?? {};
    setDraft({
      kind: channel.kind,
      name: channel.name,
      url: "",
      host: typeof cfg.host === "string" ? cfg.host : "",
      port:
        cfg.port != null
          ? String(cfg.port)
          : "587",
      secure: Boolean(cfg.secure),
      user: typeof cfg.user === "string" ? cfg.user : "",
      pass: "",
      from: typeof cfg.from === "string" ? cfg.from : "",
      to: typeof cfg.to === "string" ? cfg.to : "",
      events: parseEventList(channel.events),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function buildConfig(): Record<string, unknown> {
    if (draft.kind === "slack" || draft.kind === "teams") {
      return draft.url.trim() ? { url: draft.url.trim() } : {};
    }
    const config: Record<string, unknown> = {
      host: draft.host.trim(),
      port: Number(draft.port) || 587,
      secure: draft.secure,
      user: draft.user.trim(),
      from: draft.from.trim(),
      to: draft.to.trim(),
    };
    if (draft.pass) config.pass = draft.pass;
    return config;
  }

  async function saveChannel() {
    if (!canManage) return;
    if (!draft.name.trim() || draft.events.size === 0) return;
    return submit(async () => {
      setMsg(null);
      const events = [...draft.events].join(",");
      const config = buildConfig();
      const body: Record<string, unknown> = {
        name: draft.name.trim(),
        events,
        config,
      };
      if (!editingId) {
        body.kind = draft.kind;
      }

      const res = await fetch("/api/notification-channels", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId ? { id: editingId, ...body } : body,
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : editingId
              ? "Could not update channel"
              : "Could not add channel",
        );
      }
      cancelEdit();
      setMsg(editingId ? "Channel updated" : "Channel added");
      startTransition(() => {
        void load();
      });
    });
  }

  async function toggleEnabled(channel: Channel) {
    if (!canManage) return;
    return submit(async () => {
      setMsg(null);
      const res = await fetch("/api/notification-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channel.id,
          enabled: !channel.enabled,
        }),
      });
      if (!res.ok) throw new Error("Could not update channel");
      startTransition(() => {
        void load();
      });
    });
  }

  async function removeChannel(id: string) {
    if (!canManage) return;
    return submit(async () => {
      setMsg(null);
      const res = await fetch("/api/notification-channels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Could not remove channel");
      if (editingId === id) cancelEdit();
      setChannels((prev) => prev.filter((c) => c.id !== id));
    });
  }

  async function sendTest(id: string) {
    if (!canManage) return;
    return submit(async () => {
      setMsg(null);
      const res = await fetch("/api/notification-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Test delivery failed",
        );
      }
      setMsg("Test message sent");
    });
  }

  const draftNeedsUrl = draft.kind === "slack" || draft.kind === "teams";
  const canSave =
    Boolean(draft.name.trim()) &&
    draft.events.size > 0 &&
    (editingId
      ? true
      : draftNeedsUrl
        ? Boolean(draft.url.trim())
        : Boolean(draft.host.trim() && draft.from.trim()));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Notification channels
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Slack, Teams, or SMTP alerts for assignments, mentions, completed
          runs, coverage drops, proposals, and issues. Secrets stay write-only.
        </p>
      </div>

      {envSmtp ? (
        <StatusChip tone="info">
          TOPOLOGY_SMTP_* env configured (workspace invites)
        </StatusChip>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="text-xs text-[color:var(--topo-muted)]">{msg}</p>
      ) : null}

      {canManage ? (
        <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] p-3">
          <p className="text-xs font-medium text-[color:var(--topo-muted)]">
            {editingId ? "Edit channel" : "Add channel"}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            {!editingId ? (
              <TopoSelect
                label="Kind"
                className="w-36"
                value={draft.kind}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    kind: value as ChannelKind,
                  }))
                }
                options={[
                  { id: "slack", label: "Slack" },
                  { id: "teams", label: "Teams" },
                  { id: "smtp", label: "SMTP" },
                ]}
                compact
              />
            ) : null}
            <label className="min-w-[12rem] flex-1 space-y-1">
              <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                Name
              </span>
              <Input
                value={draft.name}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="QA Slack alerts"
              />
            </label>
          </div>

          {draftNeedsUrl ? (
            <label className="block space-y-1">
              <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                Incoming webhook URL
              </span>
              <Input
                value={draft.url}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder={
                  editingId
                    ? "leave blank to keep existing URL"
                    : "https://hooks.slack.com/services/..."
                }
              />
            </label>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                  Host
                </span>
                <Input
                  value={draft.host}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, host: e.target.value }))
                  }
                  placeholder="smtp.example.com"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                  Port
                </span>
                <Input
                  value={draft.port}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, port: e.target.value }))
                  }
                  placeholder="587"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                  From
                </span>
                <Input
                  value={draft.from}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, from: e.target.value }))
                  }
                  placeholder="topology@example.com"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                  To (alerts)
                </span>
                <Input
                  value={draft.to}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, to: e.target.value }))
                  }
                  placeholder="qa@example.com"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                  Username
                </span>
                <Input
                  value={draft.user}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, user: e.target.value }))
                  }
                  placeholder="optional"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                  Password
                </span>
                <Input
                  type="password"
                  value={draft.pass}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, pass: e.target.value }))
                  }
                  placeholder={editingId ? "leave blank to keep" : "optional"}
                />
              </label>
              <TopoCheckbox
                className="sm:col-span-2"
                compact
                isSelected={draft.secure}
                onChange={(isSelected) =>
                  setDraft((prev) => ({
                    ...prev,
                    secure: isSelected,
                  }))
                }
              >
                Use TLS from connect (port 465)
              </TopoCheckbox>
            </div>
          )}

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-[color:var(--topo-muted)]">
              Events
            </legend>
            <div className="flex flex-wrap gap-3">
              {CHANNEL_EVENTS.map((event) => (
                <TopoCheckbox
                  key={event}
                  compact
                  className="font-mono text-xs"
                  isSelected={draft.events.has(event)}
                  onChange={() => toggleDraftEvent(event)}
                >
                  {event}
                </TopoCheckbox>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              isDisabled={busy || !canSave}
              onPress={() => void saveChannel()}
            >
              {editingId ? "Save changes" : "Add"}
            </Button>
            {editingId ? (
              <Button
                size="sm"
                variant="tertiary"
                isDisabled={busy}
                onPress={cancelEdit}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[color:var(--topo-muted)]">
          You need webhook manage access to add or edit channels.
        </p>
      )}

      {channels.length === 0 ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          No channels yet. Add a Slack/Teams webhook or SMTP destination.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)]">
          {channels.map((channel) => (
            <li
              key={channel.id}
              className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0 space-y-1">
                <div className="font-medium text-[color:var(--topo-ink)]">
                  {channel.name}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip mono>{channel.kind}</StatusChip>
                  <StatusChip tone={channel.enabled ? "success" : "neutral"}>
                    {channel.enabled ? "Enabled" : "Disabled"}
                  </StatusChip>
                  {[...parseEventList(channel.events)].map((event) => (
                    <StatusChip key={event} mono>
                      {event}
                    </StatusChip>
                  ))}
                </div>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={busy}
                    onPress={() => void sendTest(channel.id)}
                  >
                    Send test
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={busy}
                    onPress={() => void toggleEnabled(channel)}
                  >
                    {channel.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={busy}
                    onPress={() => startEdit(channel)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={busy}
                    onPress={() => void removeChannel(channel.id)}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
