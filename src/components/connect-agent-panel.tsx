"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Input,
  Label,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import type { Selection } from "@heroui/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

export type AgentClient = "cursor" | "claude" | "stdio";

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: string;
  lastUsedAt: string | Date | null;
};

export type ConnectionProbe = {
  ok: boolean;
  status: number;
  message: string;
  at: Date;
};

const CLIENT_TABS: Array<{ id: AgentClient; label: string }> = [
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude" },
  { id: "stdio", label: "Generic stdio" },
];

const TOKEN_PLACEHOLDER = "topo_your_api_token";

export function snippetFor(
  client: AgentClient,
  url: string,
  tokenPlaceholder: string,
): string {
  if (client === "cursor" || client === "claude") {
    return JSON.stringify(
      {
        mcpServers: {
          topology: {
            command: "npx",
            args: ["-y", "@topology/mcp"],
            env: {
              TOPOLOGY_URL: url,
              TOPOLOGY_API_TOKEN: tokenPlaceholder,
            },
          },
        },
      },
      null,
      2,
    );
  }

  return `# Generic stdio / Codex / other MCP hosts
export TOPOLOGY_URL=${url}
export TOPOLOGY_API_TOKEN=${tokenPlaceholder}
npx -y @topology/mcp`;
}

export function agentEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return `${trimmed}/api/agent?resource=whats_pending`;
}

export function formatRelativeWhen(value: string | Date | null | undefined): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "never";
  const deltaMs = Date.now() - date.getTime();
  if (deltaMs < 0) return date.toLocaleString();
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return date.toLocaleString();
}

export function latestAgentTokenUse(tokens: TokenRow[]): Date | null {
  let latest: Date | null = null;
  for (const token of tokens) {
    if (!token.scope.split(",").map((s) => s.trim()).includes("agent")) {
      continue;
    }
    if (!token.lastUsedAt) continue;
    const date =
      typeof token.lastUsedAt === "string"
        ? new Date(token.lastUsedAt)
        : token.lastUsedAt;
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }
  return latest;
}

export function ConnectAgentPanel({
  defaultUrl,
  compact = false,
}: {
  defaultUrl: string;
  compact?: boolean;
}) {
  const [client, setClient] = useState<AgentClient>("cursor");
  const [url, setUrl] = useState(defaultUrl);
  const [token, setToken] = useState(TOKEN_PLACEHOLDER);
  const [copied, setCopied] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);
  const [probe, setProbe] = useState<ConnectionProbe | null>(null);
  const [lastAgentCall, setLastAgentCall] = useState<Date | null>(null);
  const [canManageTokens, setCanManageTokens] = useState(true);

  const snippet = useMemo(
    () =>
      snippetFor(client, url || defaultUrl, token.trim() || TOKEN_PLACEHOLDER),
    [client, url, token, defaultUrl],
  );

  const refreshLastAgentCall = useCallback(async () => {
    const res = await fetch("/api/tokens");
    if (res.status === 403 || res.status === 401) {
      setCanManageTokens(false);
      return;
    }
    if (!res.ok) return;
    setCanManageTokens(true);
    const data = (await res.json()) as { tokens: TokenRow[] };
    setLastAgentCall(latestAgentTokenUse(data.tokens ?? []));
  }, []);

  useEffect(() => {
    void refreshLastAgentCall();
  }, [refreshLastAgentCall]);

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function generateAgentToken() {
    setTokenError(null);
    setTokenMsg(null);
    setCreatingToken(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `MCP agent ${new Date().toISOString().slice(0, 10)}`,
          scope: "agent",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        plaintext?: string;
      };
      if (res.status === 403 || res.status === 401) {
        setCanManageTokens(false);
        setTokenError(
          "Only project admins can create API tokens. Create one under Settings → Security, then paste it here.",
        );
        return;
      }
      if (!res.ok) {
        setTokenError(
          typeof data.error === "string"
            ? data.error
            : "Could not create agent token",
        );
        return;
      }
      if (!data.plaintext) {
        setTokenError("Token created but plaintext was not returned.");
        return;
      }
      setToken(data.plaintext);
      setTokenMsg(
        "Agent-scoped token created and filled below. Copy the snippet now — the plaintext is only shown once.",
      );
      await refreshLastAgentCall();
    } finally {
      setCreatingToken(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setProbe(null);
    const endpoint = agentEndpoint(url || defaultUrl);
    const bearer = token.trim();
    try {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${bearer}`,
          Accept: "application/json",
        },
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
      };
      const message = res.ok
        ? "Connected — agent API responded to whats_pending."
        : typeof data.error === "string"
          ? data.error
          : `HTTP ${res.status}`;
      setProbe({
        ok: res.ok,
        status: res.status,
        message,
        at: new Date(),
      });
      if (res.ok) {
        await refreshLastAgentCall();
      }
    } catch (err) {
      setProbe({
        ok: false,
        status: 0,
        message:
          err instanceof Error
            ? err.message
            : "Could not reach the agent API",
        at: new Date(),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      {compact ? (
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Connect an agent
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
            Point Cursor, Claude, or a generic stdio MCP host at this Topology
            instance with{" "}
            <code className="font-mono">TOPOLOGY_URL</code> and{" "}
            <code className="font-mono">TOPOLOGY_API_TOKEN</code>.
          </p>
          <div className="mt-2">
            <StatusChip mono>@topology/mcp</StatusChip>
          </div>
        </div>
      ) : (
        <PageHeader
          eyebrow="Agent plugin"
          title="Connect an agent"
          description="Point Cursor, Claude, or a generic stdio MCP host at this Topology instance with TOPOLOGY_URL and TOPOLOGY_API_TOKEN. The MCP package talks to the same agent REST API as the UI."
          meta={<StatusChip mono>@topology/mcp</StatusChip>}
        />
      )}

      <ToggleButtonGroup
        aria-label="MCP client"
        selectionMode="single"
        disallowEmptySelection
        size="sm"
        isDetached
        className="flex flex-wrap gap-2"
        selectedKeys={new Set([client])}
        onSelectionChange={(keys: Selection) => {
          if (keys === "all") return;
          const next = [...keys][0];
          if (next == null) return;
          setClient(String(next) as AgentClient);
        }}
      >
        {CLIENT_TABS.map(({ id, label }) => (
          <ToggleButton key={id} id={id}>
            {label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="topology-url" className="w-full" variant="secondary">
          <Label className="text-[color:var(--topo-muted)]">Topology URL</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full font-mono text-sm"
          />
        </TextField>
        <TextField name="api-token" className="w-full" variant="secondary">
          <Label className="text-[color:var(--topo-muted)]">API token</Label>
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
        </TextField>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManageTokens ? (
          <Button
            size="sm"
            variant="secondary"
            isDisabled={creatingToken}
            onPress={() => void generateAgentToken()}
          >
            {creatingToken ? "Creating…" : "Generate agent token"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          isDisabled={testing || !token.trim()}
          onPress={() => void testConnection()}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <p className="text-xs text-[color:var(--topo-muted)]">
          Last agent call:{" "}
          <span className="font-medium text-[color:var(--topo-ink)]">
            {formatRelativeWhen(lastAgentCall)}
          </span>
          {probe ? (
            <>
              {" "}
              · Test:{" "}
              <span
                className={
                  probe.ok
                    ? "font-medium text-emerald-700 dark:text-emerald-400"
                    : "font-medium text-red-600 dark:text-red-400"
                }
              >
                {probe.ok ? "ok" : "failed"}
              </span>{" "}
              ({formatRelativeWhen(probe.at)})
            </>
          ) : null}
        </p>
      </div>

      {probe ? (
        <p
          className={`text-xs ${
            probe.ok
              ? "text-[color:var(--topo-muted)]"
              : "text-red-600 dark:text-red-400"
          }`}
          role="status"
        >
          {probe.message}
        </p>
      ) : null}
      {tokenError ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {tokenError}
        </p>
      ) : null}
      {tokenMsg ? (
        <p className="text-xs text-[color:var(--topo-muted)]">{tokenMsg}</p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[color:var(--topo-ink)]">
            {client === "cursor"
              ? "Cursor snippet"
              : client === "claude"
                ? "Claude Code snippet"
                : "Generic stdio snippet"}
          </h2>
          <Button size="sm" variant="secondary" onPress={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4 text-xs text-[color:var(--topo-ink)]">
          {snippet}
        </pre>
      </div>

      <p className="text-xs text-[color:var(--topo-muted)]">
        Local demo: set{" "}
        <code className="font-mono">TOPOLOGY_API_TOKEN</code> in{" "}
        <code className="font-mono">.env.local</code> (see{" "}
        <code className="font-mono">.env.example</code>). Default issue provider
        is <code className="font-mono">mock</code> so create/link/status works
        offline. Prefer an <code className="font-mono">agent</code>-scoped token
        for MCP.
      </p>
    </div>
  );
}
