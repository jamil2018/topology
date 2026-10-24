"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@heroui/react";
import { StatusChip } from "./status-chip";
import { API_TOKEN_SCOPES, type ApiTokenScope } from "@/lib/api-token-scopes";

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: string;
  expiresAt: string | Date | null;
  createdAt: string | Date;
  lastUsedAt: string | Date | null;
};

function formatWhen(value: string | Date | null | undefined) {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "never";
  return date.toLocaleString();
}

export function ApiTokensPanel() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenScope>("ci-write");
  const [expiresAt, setExpiresAt] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/tokens");
    if (res.status === 403) {
      setError("Only project admins can manage API tokens.");
      setTokens([]);
      return;
    }
    if (!res.ok) throw new Error("Failed to load tokens");
    const data = (await res.json()) as { tokens: TokenRow[] };
    setTokens(data.tokens);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, []);

  async function createToken() {
    setError(null);
    setMsg(null);
    setPlaintext(null);
    setSaving(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scope,
          expiresAt: expiresAt
            ? new Date(expiresAt).toISOString()
            : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        plaintext?: string;
        token?: TokenRow;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not create token",
        );
        return;
      }
      setName("");
      setExpiresAt("");
      setPlaintext(data.plaintext ?? null);
      setMsg("Token created. Copy it now — it will not be shown again.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function revokeToken(id: string) {
    setError(null);
    const res = await fetch("/api/tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setError("Could not revoke token");
      return;
    }
    setTokens((prev) => prev.filter((token) => token.id !== id));
    setMsg("Token revoked");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          API tokens
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Bearer tokens for CLI, CI ingest, and the agent. Hashed at rest.
          Choose a scope: <span className="font-mono">read</span>,{" "}
          <span className="font-mono">ci-write</span>, or{" "}
          <span className="font-mono">agent</span>.
        </p>
      </div>

      {plaintext ? (
        <div className="space-y-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] p-3">
          <p className="text-xs font-medium text-[color:var(--topo-ink)]">
            New token (shown once)
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-[color:var(--topo-ink)]">
            {plaintext}
          </pre>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void navigator.clipboard.writeText(plaintext)}
          >
            Copy token
          </Button>
        </div>
      ) : null}

      {tokens.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-[color:var(--topo-line)] px-2 py-1.5"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[color:var(--topo-ink)]">
                    {token.name}
                  </span>
                  <StatusChip mono>{token.tokenPrefix}…</StatusChip>
                  <StatusChip>{token.scope}</StatusChip>
                </div>
                <p className="text-[11px] text-[color:var(--topo-muted)]">
                  Last used {formatWhen(token.lastUsedAt)}
                  {token.expiresAt
                    ? ` · expires ${formatWhen(token.expiresAt)}`
                    : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => void revokeToken(token.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[color:var(--topo-muted)]">
          No active tokens.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            Name
          </span>
          <Input
            placeholder="CI ingest"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--topo-muted)]">
          Scope
          <select
            className="rounded border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
            value={scope}
            onChange={(e) => setScope(e.target.value as ApiTokenScope)}
          >
            {API_TOKEN_SCOPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            Expires (optional)
          </span>
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
      </div>
      <Button
        size="sm"
        variant="primary"
        isDisabled={saving || !name.trim()}
        onPress={() => void createToken()}
      >
        {saving ? "Creating…" : "Create token"}
      </Button>

      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="text-xs text-[color:var(--topo-muted)]">{msg}</p>
      ) : null}
    </div>
  );
}
