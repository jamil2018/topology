"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { StatusChip } from "./status-chip";

const PROVIDERS = [
  { id: "none", label: "None (air-gapped)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "azure", label: "Azure OpenAI" },
  { id: "compatible-local", label: "OpenAI-compatible (local)" },
] as const;

type ProviderState = {
  provider: string;
  enabled: boolean;
  model: string | null;
  baseUrl: string | null;
  source: string;
  hasApiKey: boolean;
  envProvider: string;
  workspaceOverride: {
    provider: string | null;
    model: string | null;
    baseUrl: string | null;
  };
};

export function AiSettingsPanel() {
  const [state, setState] = useState<ProviderState | null>(null);
  const [provider, setProvider] = useState("none");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/ai/provider");
    const data = (await res.json()) as ProviderState & { error?: string };
    if (!res.ok) {
      setLoadError(data.error ?? "Failed to load AI settings");
      return;
    }
    setState(data);
    setProvider(data.workspaceOverride.provider ?? data.provider ?? "none");
    setModel(data.workspaceOverride.model ?? data.model ?? "");
    setBaseUrl(data.workspaceOverride.baseUrl ?? data.baseUrl ?? "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/ai/provider", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        model: model.trim() || null,
        baseUrl: baseUrl.trim() || null,
      }),
    });
    const data = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Save failed");
      return;
    }
    setMsg("Saved workspace AI override.");
    await load();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[color:var(--topo-muted)]">
        Effective provider merges workspace override with server env. API keys stay
        in environment variables (
        <code className="font-mono">TOPOLOGY_AI_API_KEY</code>, etc.).
      </p>

      {loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : state ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--topo-muted)]">
          <span>Effective:</span>
          <StatusChip mono>{state.provider}</StatusChip>
          {state.enabled ? (
            <StatusChip tone="success">enabled</StatusChip>
          ) : (
            <StatusChip tone="neutral">disabled</StatusChip>
          )}
          <span>
            env <code className="font-mono">{state.envProvider}</code> · source{" "}
            {state.source}
            {state.hasApiKey ? " · key set" : ""}
          </span>
        </div>
      ) : null}

      <label className="block space-y-1 text-sm">
        <span className="text-[color:var(--topo-ink)]">Workspace provider</span>
        <select
          className="w-full max-w-md rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-bg)] px-2 py-1.5 text-sm"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-[color:var(--topo-ink)]">Model override</span>
        <input
          className="w-full max-w-md rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-bg)] px-2 py-1.5 text-sm font-mono"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g. gpt-4o-mini"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-[color:var(--topo-ink)]">Base URL override</span>
        <input
          className="w-full max-w-md rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-bg)] px-2 py-1.5 text-sm font-mono"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Azure endpoint or http://127.0.0.1:11434/v1"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onPress={() => void save()} isDisabled={saving}>
          {saving ? "Saving…" : "Save workspace AI"}
        </Button>
        {msg ? (
          <span className="text-xs text-[color:var(--topo-muted)]">{msg}</span>
        ) : null}
      </div>

      <p className="text-xs text-[color:var(--topo-muted)]">
        Self-host: set <code className="font-mono">TOPOLOGY_AI_PROVIDER</code> in{" "}
        <code className="font-mono">.env.local</code> when no workspace override
        is needed. Draft jobs create pending proposals only — review under
        Insights → Proposals. Jobs: intents from requirement, negative paths,
        link suggestions, duplicate-intent hints, and change-impact explanation.
      </p>
    </div>
  );
}
