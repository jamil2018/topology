"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Input, TextArea } from "@heroui/react";
import { formatDateTime } from "@/lib/format-date";
import { StatusChip } from "./status-chip";
import { useMutationFeedback } from "./use-mutation-feedback";
import { useProjectActions } from "./project-actions";

const WEBHOOK_EVENTS = [
  "run.completed",
  "issue.created",
  "intent.stale",
  "coverage.dropped",
  "proposal.created",
] as const;

type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

type Endpoint = {
  id: string;
  url: string;
  events: string;
  description: string;
  enabled: number;
  lastStatus: number | null;
  lastDeliveredAt: string | Date | null;
  hasSecret?: boolean;
};

type Delivery = {
  id: string;
  event: string;
  deliveryId: string;
  requestBody: string;
  responseStatus: number | null;
  responseExcerpt: string;
  attemptCount: number;
  durationMs: number | null;
  deliveredAt: string | Date;
};

function parseEventList(raw: string): Set<WebhookEvent> {
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim())
      .filter((e): e is WebhookEvent =>
        (WEBHOOK_EVENTS as readonly string[]).includes(e),
      ),
  );
}

function formatDeliveredAt(value: string | Date | null): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return formatDateTime(d);
}

const emptyDraft = {
  url: "",
  secret: "",
  description: "",
  events: new Set<WebhookEvent>(["run.completed", "issue.created"]),
};

export function WebhooksPanel() {
  const { can } = useProjectActions();
  const canManage = can("webhooks.manage");
  const [pending, startTransition] = useTransition();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [envFallback, setEnvFallback] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyEndpointId, setHistoryEndpointId] = useState<string | null>(
    null,
  );
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [payloadOpenId, setPayloadOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { saving, submit } = useMutationFeedback(setError);
  const busy = pending || saving;

  async function load() {
    const res = await fetch("/api/webhooks");
    if (!res.ok) throw new Error("Failed to load webhooks");
    const data = (await res.json()) as {
      endpoints: Endpoint[];
      envFallback: boolean;
    };
    setEndpoints(data.endpoints);
    setEnvFallback(data.envFallback);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, []);

  function toggleDraftEvent(event: WebhookEvent) {
    setDraft((prev) => {
      const next = new Set(prev.events);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return { ...prev, events: next };
    });
  }

  function startEdit(ep: Endpoint) {
    setEditingId(ep.id);
    setMsg(null);
    setDraft({
      url: ep.url,
      secret: "",
      description: ep.description ?? "",
      events: parseEventList(ep.events),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function saveEndpoint() {
    if (!canManage) return;
    if (!draft.url.trim() || draft.events.size === 0) return;
    return submit(async () => {
      setMsg(null);
      const events = [...draft.events].join(",");
      const body: Record<string, unknown> = {
        url: draft.url.trim(),
        events,
        description: draft.description.trim(),
      };
      if (draft.secret.trim()) body.secret = draft.secret.trim();

      const res = await fetch("/api/webhooks", {
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
              ? "Could not update webhook"
              : "Could not add webhook",
        );
      }
      cancelEdit();
      setMsg(editingId ? "Webhook updated" : "Webhook added");
      startTransition(() => {
        void load();
      });
    });
  }

  async function toggleEnabled(ep: Endpoint) {
    if (!canManage) return;
    return submit(async () => {
      setMsg(null);
      const res = await fetch("/api/webhooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ep.id, enabled: !ep.enabled }),
      });
      if (!res.ok) throw new Error("Could not update webhook");
      startTransition(() => {
        void load();
      });
    });
  }

  async function removeEndpoint(id: string) {
    if (!canManage) return;
    return submit(async () => {
      setMsg(null);
      const res = await fetch("/api/webhooks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Could not remove webhook");
      if (editingId === id) cancelEdit();
      if (historyEndpointId === id) {
        setHistoryEndpointId(null);
        setDeliveries([]);
        setPayloadOpenId(null);
      }
      setEndpoints((prev) => prev.filter((e) => e.id !== id));
    });
  }

  async function sendTest() {
    if (!canManage) return;
    return submit(async () => {
      setMsg(null);
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      if (!res.ok) throw new Error("Test delivery failed to queue");
      setMsg("Test run.completed payload dispatched");
      startTransition(() => {
        void load();
      });
      if (historyEndpointId) {
        void loadDeliveries(historyEndpointId);
      }
    });
  }

  async function loadDeliveries(endpointId: string) {
    setDeliveriesLoading(true);
    try {
      const res = await fetch(`/api/webhooks/${endpointId}/deliveries`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to load delivery history",
        );
      }
      const data = (await res.json()) as { deliveries: Delivery[] };
      setDeliveries(data.deliveries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setDeliveries([]);
    } finally {
      setDeliveriesLoading(false);
    }
  }

  function toggleHistory(endpointId: string) {
    if (historyEndpointId === endpointId) {
      setHistoryEndpointId(null);
      setDeliveries([]);
      setPayloadOpenId(null);
      return;
    }
    setHistoryEndpointId(endpointId);
    setPayloadOpenId(null);
    setMsg(null);
    void loadDeliveries(endpointId);
  }

  async function replayDelivery(endpointId: string, deliveryRowId: string) {
    if (!canManage) return;
    return submit(async () => {
      setMsg(null);
      const res = await fetch(`/api/webhooks/${endpointId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: deliveryRowId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Replay failed",
        );
      }
      const data = (await res.json()) as {
        ok: boolean;
        status: number | null;
        deliveryId: string;
      };
      setMsg(
        data.ok
          ? `Replay delivered (${data.status ?? "n/a"})`
          : `Replay finished with status ${data.status ?? "n/a"}`,
      );
      startTransition(() => {
        void load();
      });
      await loadDeliveries(endpointId);
    });
  }

  function prettyPayload(raw: string): string {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Webhooks
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          JSON POST on subscribed events. Optional HMAC via secret (
          <span className="font-mono">X-Topology-Signature</span>).
        </p>
      </div>

      {envFallback ? (
        <StatusChip tone="info">
          TOPOLOGY_WEBHOOK_URL env fallback active
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
            {editingId ? "Edit endpoint" : "Add endpoint"}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[220px] flex-1 space-y-1">
              <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                Endpoint URL
              </span>
              <Input
                value={draft.url}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder="https://hooks.example.com/topology"
              />
            </label>
            <label className="w-40 space-y-1">
              <span className="font-medium text-xs text-[color:var(--topo-muted)]">
                Secret
              </span>
              <Input
                value={draft.secret}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, secret: e.target.value }))
                }
                placeholder={
                  editingId ? "leave blank to keep" : "optional"
                }
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="font-medium text-xs text-[color:var(--topo-muted)]">
              Description
            </span>
            <TextArea
              value={draft.description}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Optional note"
              className="min-h-12"
            />
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-[color:var(--topo-muted)]">
              Events
            </legend>
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENTS.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-1.5 text-xs font-mono"
                >
                  <input
                    type="checkbox"
                    checked={draft.events.has(event)}
                    onChange={() => toggleDraftEvent(event)}
                  />
                  {event}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              isDisabled={
                busy || !draft.url.trim() || draft.events.size === 0
              }
              onPress={() => void saveEndpoint()}
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
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy}
              onPress={() => void sendTest()}
            >
              Send test
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[color:var(--topo-muted)]">
          You need webhook manage access to add or edit endpoints.
        </p>
      )}

      {endpoints.length === 0 ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          No endpoints yet. Add a URL or set{" "}
          <span className="font-mono">TOPOLOGY_WEBHOOK_URL</span>.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)]">
          {endpoints.map((ep) => {
            const delivered = formatDeliveredAt(ep.lastDeliveredAt);
            const historyOpen = historyEndpointId === ep.id;
            return (
              <li key={ep.id} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="truncate font-mono text-xs text-[color:var(--topo-ink)]">
                      {ep.url}
                    </div>
                    {ep.description ? (
                      <p className="text-xs text-[color:var(--topo-muted)]">
                        {ep.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip tone={ep.enabled ? "success" : "neutral"}>
                        {ep.enabled ? "Enabled" : "Disabled"}
                      </StatusChip>
                      {parseEventList(ep.events).size > 0
                        ? [...parseEventList(ep.events)].map((event) => (
                            <StatusChip key={event} mono>
                              {event}
                            </StatusChip>
                          ))
                        : (
                          <StatusChip mono>{ep.events || "none"}</StatusChip>
                        )}
                      {ep.lastStatus != null ? (
                        <StatusChip
                          tone={
                            ep.lastStatus >= 200 && ep.lastStatus < 300
                              ? "success"
                              : "danger"
                          }
                          mono
                        >
                          last {ep.lastStatus}
                        </StatusChip>
                      ) : null}
                      {delivered ? (
                        <StatusChip tone="neutral">
                          Delivered {delivered}
                        </StatusChip>
                      ) : (
                        <StatusChip tone="neutral">Never delivered</StatusChip>
                      )}
                    </div>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="tertiary"
                        isDisabled={busy}
                        onPress={() => toggleHistory(ep.id)}
                        aria-expanded={historyOpen}
                      >
                        {historyOpen ? "Hide history" : "History"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={busy}
                        onPress={() => void toggleEnabled(ep)}
                      >
                        {ep.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="tertiary"
                        isDisabled={busy}
                        onPress={() => startEdit(ep)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={busy}
                        onPress={() => void removeEndpoint(ep.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>

                {historyOpen ? (
                  <div className="mt-3 space-y-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface,transparent)] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[color:var(--topo-muted)]">
                        Delivery history
                      </p>
                      <Button
                        size="sm"
                        variant="tertiary"
                        isDisabled={busy || deliveriesLoading}
                        onPress={() => void loadDeliveries(ep.id)}
                      >
                        Refresh
                      </Button>
                    </div>
                    {deliveriesLoading ? (
                      <p className="text-xs text-[color:var(--topo-muted)]">
                        Loading…
                      </p>
                    ) : deliveries.length === 0 ? (
                      <p className="text-xs text-[color:var(--topo-muted)]">
                        No deliveries recorded yet.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {deliveries.map((d) => {
                          const when = formatDeliveredAt(d.deliveredAt);
                          const ok =
                            d.responseStatus != null &&
                            d.responseStatus >= 200 &&
                            d.responseStatus < 300;
                          const payloadOpen = payloadOpenId === d.id;
                          return (
                            <li
                              key={d.id}
                              className="rounded border border-[color:var(--topo-line)] px-2.5 py-2"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap gap-1.5">
                                    <StatusChip
                                      tone={ok ? "success" : "danger"}
                                      mono
                                    >
                                      {d.responseStatus ?? "err"}
                                    </StatusChip>
                                    <StatusChip mono>{d.event}</StatusChip>
                                    <StatusChip tone="neutral">
                                      {d.attemptCount} attempt
                                      {d.attemptCount === 1 ? "" : "s"}
                                      {d.durationMs != null
                                        ? ` · ${d.durationMs}ms`
                                        : ""}
                                    </StatusChip>
                                    {when ? (
                                      <StatusChip tone="neutral">
                                        {when}
                                      </StatusChip>
                                    ) : null}
                                  </div>
                                  <p className="truncate font-mono text-[10px] text-[color:var(--topo-muted)]">
                                    {d.deliveryId}
                                  </p>
                                  {d.responseExcerpt ? (
                                    <p className="line-clamp-2 text-[11px] text-[color:var(--topo-muted)]">
                                      {d.responseExcerpt}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    size="sm"
                                    variant="tertiary"
                                    isDisabled={busy}
                                    onPress={() =>
                                      setPayloadOpenId(
                                        payloadOpen ? null : d.id,
                                      )
                                    }
                                  >
                                    {payloadOpen ? "Hide payload" : "Payload"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    isDisabled={busy}
                                    onPress={() =>
                                      void replayDelivery(ep.id, d.id)
                                    }
                                  >
                                    Replay
                                  </Button>
                                </div>
                              </div>
                              {payloadOpen ? (
                                <pre className="mt-2 max-h-48 overflow-auto rounded bg-[color:var(--topo-line)]/30 p-2 font-mono text-[10px] leading-relaxed text-[color:var(--topo-ink)]">
                                  {prettyPayload(d.requestBody)}
                                </pre>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
