"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { StatusChip } from "./status-chip";

type RepositoryRow = {
  id: string;
  remoteUrl: string;
  provider: "github" | "gitlab" | "other";
  defaultBranch: string;
};

type PathRuleRow = {
  id: string;
  pattern: string;
  componentKey: string | null;
  componentTitle: string | null;
};

export function RepositoriesPanel() {
  const [pending, startTransition] = useTransition();
  const [repos, setRepos] = useState<RepositoryRow[]>([]);
  const [pathRules, setPathRules] = useState<PathRuleRow[]>([]);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [provider, setProvider] = useState<"github" | "gitlab" | "other">(
    "github",
  );
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleComponentKey, setRuleComponentKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const webhookBase =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/github`
      : "/api/webhooks/github";

  const load = useCallback(async () => {
    const [repoRes, rulesRes] = await Promise.all([
      fetch("/api/repositories"),
      fetch("/api/path-rules"),
    ]);
    if (!repoRes.ok) throw new Error("Failed to load repositories");
    if (!rulesRes.ok) throw new Error("Failed to load path rules");
    const repoData = (await repoRes.json()) as { repositories: RepositoryRow[] };
    const rulesData = (await rulesRes.json()) as { pathRules: PathRuleRow[] };
    setRepos(repoData.repositories);
    setPathRules(rulesData.pathRules);
  }, []);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  async function addRepository() {
    setError(null);
    setMsg(null);
    const res = await fetch("/api/repositories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remoteUrl: remoteUrl.trim(),
        provider,
        defaultBranch: defaultBranch.trim() || "main",
      }),
    });
    if (!res.ok) {
      setError("Could not add repository");
      return;
    }
    setRemoteUrl("");
    setMsg("Repository connected");
    startTransition(() => {
      void load();
    });
  }

  async function addPathRule() {
    setError(null);
    setMsg(null);
    const res = await fetch("/api/path-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: rulePattern.trim(),
        componentKey: ruleComponentKey.trim(),
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        typeof data.error === "string" ? data.error : "Could not add path rule",
      );
      return;
    }
    setRulePattern("");
    setRuleComponentKey("");
    setMsg("Path rule added");
    startTransition(() => {
      void load();
    });
  }

  async function removePathRule(id: string) {
    setError(null);
    const res = await fetch(`/api/path-rules?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Could not remove path rule");
      return;
    }
    setPathRules((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[color:var(--topo-muted)]">
        Connect git remotes so push and pull request webhooks can record commits
        and changed paths for impact analysis.
      </p>

      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-[color:var(--topo-ink)]">
            GitHub webhook URL
          </p>
          <StatusChip mono>TOPOLOGY_GITHUB_WEBHOOK_SECRET</StatusChip>
        </div>
        <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
          Append{" "}
          <code className="font-mono">?workspaceId=&lt;project-uuid&gt;</code> or
          send header{" "}
          <code className="font-mono">x-topology-project-id</code>. Optional{" "}
          <code className="font-mono">x-topology-changed-files</code> on PR
          events (JSON array or comma-separated paths).
        </p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-[color:var(--topo-ink)]">
          {webhookBase}?workspaceId=&lt;your-project-id&gt;
        </pre>
      </div>

      {repos.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {repos.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded border border-[color:var(--topo-line)] px-2 py-1.5"
            >
              <StatusChip>{r.provider}</StatusChip>
              <span className="font-mono text-xs text-[color:var(--topo-ink)]">
                {r.remoteUrl}
              </span>
              <span className="text-xs text-[color:var(--topo-muted)]">
                default {r.defaultBranch}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[color:var(--topo-muted)]">
          No repositories yet.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            Remote URL
          </span>
          <Input
            placeholder="https://github.com/org/repo.git"
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            Default branch
          </span>
          <Input
            value={defaultBranch}
            onChange={(e) => setDefaultBranch(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--topo-muted)]">
          Provider
          <select
            className="rounded border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
            value={provider}
            onChange={(e) =>
              setProvider(e.target.value as "github" | "gitlab" | "other")
            }
          >
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="other">Other</option>
          </select>
        </label>
        <Button
          size="sm"
          variant="primary"
          isDisabled={pending || !remoteUrl.trim()}
          onPress={() => void addRepository()}
        >
          Connect repository
        </Button>
      </div>

      <div className="border-t border-[color:var(--topo-line)] pt-4">
        <h3 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Path → component rules
        </h3>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Map changed file paths to component keys for impact walks.
        </p>

        {pathRules.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm">
            {pathRules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-[color:var(--topo-line)] px-2 py-1"
              >
                <span className="font-mono text-xs">
                  {rule.pattern} → {rule.componentKey ?? "?"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => void removePathRule(rule.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
              Pattern
            </span>
            <Input
              placeholder="src/payments/"
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
              Component key
            </span>
            <Input
              placeholder="COMP-PAYMENTS"
              value={ruleComponentKey}
              onChange={(e) => setRuleComponentKey(e.target.value)}
            />
          </label>
        </div>
        <Button
          className="mt-2"
          size="sm"
          variant="secondary"
          isDisabled={
            pending || !rulePattern.trim() || !ruleComponentKey.trim()
          }
          onPress={() => void addPathRule()}
        >
          Add path rule
        </Button>
      </div>

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
