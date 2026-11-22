"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { PanelListSkeleton } from "./skeletons";
import { StatusChip } from "./status-chip";
import { useProjectActions } from "./project-actions";

type ProviderRow = {
  provider: string;
  path: string;
  signingConfigured: boolean;
  secretEnvKeys: string[];
};

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub Issues",
  gitlab: "GitLab Issues",
  jira: "Jira",
  linear: "Linear",
};

export function InboundIssueSyncPanel({ defaultUrl }: { defaultUrl: string }) {
  const { projectId } = useProjectActions();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(projectId);
  const [error, setError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const base = defaultUrl.replace(/\/$/, "");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks/issues");
      if (!res.ok) {
        setError("Could not load inbound issue webhook status.");
        return;
      }
      const data = (await res.json()) as {
        workspaceId: string;
        providers: ProviderRow[];
      };
      setWorkspaceId(data.workspaceId);
      setProviders(data.providers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyUrl(path: string) {
    const qs = workspaceId
      ? `?workspaceId=${encodeURIComponent(workspaceId)}`
      : "?workspaceId=<project-uuid>";
    const url = `${base}${path}${qs}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPath(path);
      window.setTimeout(() => setCopiedPath(null), 1500);
    } catch {
      setError("Could not copy webhook URL.");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[color:var(--topo-muted)]">
        Point issue trackers at Topology so remote close / reopen updates linked
        defects. Append{" "}
        <code className="font-mono">?workspaceId=</code> or send header{" "}
        <code className="font-mono">x-topology-project-id</code>. Signing secrets
        are env-only — never returned by the API.
      </p>

      {error ? (
        <p className="text-xs text-[color:var(--topo-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div role="status" aria-busy="true" aria-label="Loading inbound sync">
          <PanelListSkeleton rows={3} withActions={false} />
        </div>
      ) : providers.length === 0 ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          No inbound providers configured.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)]">
          {providers.map((row) => {
            const label = PROVIDER_LABELS[row.provider] ?? row.provider;
            const qs = workspaceId
              ? `?workspaceId=${workspaceId}`
              : "?workspaceId=<project-uuid>";
            return (
              <li
                key={row.provider}
                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-[color:var(--topo-ink)]">
                      {label}
                    </span>
                    {row.signingConfigured ? (
                      <StatusChip tone="success" mono>
                        Signing ready
                      </StatusChip>
                    ) : (
                      <StatusChip tone="warning" mono>
                        Secret missing
                      </StatusChip>
                    )}
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-[color:var(--topo-ink)]">
                    {base}
                    {row.path}
                    {qs}
                  </pre>
                  <p className="font-mono text-[10px] text-[color:var(--topo-muted)]">
                    {row.secretEnvKeys.join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => void copyUrl(row.path)}
                >
                  {copiedPath === row.path ? "Copied" : "Copy URL"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
