"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { StatusChip } from "./status-chip";

type Endpoint = {
  id: string;
  url: string;
  events: string;
  description: string;
  enabled: number;
  lastStatus: number | null;
  lastDeliveredAt: string | Date | null;
};

export function WebhooksPanel() {
  const [pending, startTransition] = useTransition();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [envFallback, setEnvFallback] = useState(false);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  async function addEndpoint() {
    setError(null);
    setMsg(null);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: url.trim(),
        secret: secret.trim(),
        events: "run.completed,issue.created",
      }),
    });
    if (!res.ok) {
      setError("Could not add webhook");
      return;
    }
    setUrl("");
    setSecret("");
    setMsg("Webhook added");
    startTransition(() => {
      void load();
    });
  }

  async function removeEndpoint(id: string) {
    setError(null);
    const res = await fetch("/api/webhooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setError("Could not remove webhook");
      return;
    }
    setEndpoints((prev) => prev.filter((e) => e.id !== id));
  }

  async function sendTest() {
    setError(null);
    setMsg(null);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    if (!res.ok) {
      setError("Test delivery failed to queue");
      return;
    }
    setMsg("Test run.completed payload dispatched");
    startTransition(() => {
      void load();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Webhooks
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          JSON POST on{" "}
          <span className="font-mono">run.completed</span>,{" "}
          <span className="font-mono">issue.created</span>,{" "}
          <span className="font-mono">intent.stale</span>,{" "}
          <span className="font-mono">coverage.dropped</span>, and{" "}
          <span className="font-mono">proposal.created</span>. Optional HMAC via
          secret (<span className="font-mono">X-Topology-Signature</span>).
        </p>
      </div>

      {envFallback ? (
        <StatusChip tone="info">
          TOPOLOGY_WEBHOOK_URL env fallback active
        </StatusChip>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {msg ? (
        <p className="text-xs text-[color:var(--topo-muted)]">{msg}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            Endpoint URL
          </span>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.example.com/topology"
          />
        </label>
        <label className="w-40 space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            Secret
          </span>
          <Input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="optional"
          />
        </label>
        <Button
          size="sm"
          variant="primary"
          isDisabled={pending || !url.trim()}
          onPress={() => void addEndpoint()}
        >
          Add
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={pending}
          onPress={() => void sendTest()}
        >
          Send test
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          No endpoints yet. Add a URL or set{" "}
          <span className="font-mono">TOPOLOGY_WEBHOOK_URL</span>.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)]">
          {endpoints.map((ep) => (
            <li
              key={ep.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-[color:var(--topo-ink)]">
                  {ep.url}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatusChip mono>{ep.events}</StatusChip>
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
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => void removeEndpoint(ep.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
