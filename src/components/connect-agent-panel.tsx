"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

type Client = "cursor" | "claude" | "codex";

function snippetFor(
  client: Client,
  url: string,
  tokenPlaceholder: string,
): string {
  if (client === "cursor") {
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

  if (client === "claude") {
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

  return `# Codex / MCP hosts
# Set env then run the server:
export TOPOLOGY_URL=${url}
export TOPOLOGY_API_TOKEN=${tokenPlaceholder}
npx -y @topology/mcp`;
}

export function ConnectAgentPanel({
  defaultUrl,
  compact = false,
}: {
  defaultUrl: string;
  compact?: boolean;
}) {
  const [client, setClient] = useState<Client>("cursor");
  const [url, setUrl] = useState(defaultUrl);
  const [token, setToken] = useState("topo_your_api_token");
  const [copied, setCopied] = useState(false);

  const snippet = useMemo(
    () => snippetFor(client, url || defaultUrl, token || "topo_your_api_token"),
    [client, url, token, defaultUrl],
  );

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {compact ? (
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Connect an agent
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
            Point Claude, Cursor, or Codex at this Topology instance with{" "}
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
          description="Point Claude, Cursor, or Codex at this Topology instance with TOPOLOGY_URL and TOPOLOGY_API_TOKEN. The MCP package talks to the same agent REST API as the UI."
          meta={<StatusChip mono>@topology/mcp</StatusChip>}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-[color:var(--topo-muted)]">Topology URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[color:var(--topo-muted)]">API token</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["cursor", "Cursor"],
            ["claude", "Claude Desktop"],
            ["codex", "Codex"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setClient(id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              client === id
                ? "bg-[color:var(--topo-ink)] text-[color:var(--topo-paper)]"
                : "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[color:var(--topo-ink)]">
            Copyable snippet
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
        offline.
      </p>
    </div>
  );
}
