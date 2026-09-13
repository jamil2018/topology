"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { ClockCounterClockwiseIcon, XIcon } from "@phosphor-icons/react";

export type ActivityRow = {
  id: string;
  summary: string;
  action: string;
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string | Date;
  actorName: string | null;
  actorEmail: string | null;
};

function formatWhen(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CaseHistoryPanel({
  caseKey,
  caseTitle,
  caseId,
  onClose,
}: {
  caseKey: string;
  caseTitle: string;
  caseId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/cases/${caseId}/activity`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to load history",
          );
        }
        if (!cancelled) {
          setActivities(data.activities ?? []);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load history");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <aside className="flex h-full flex-col rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--topo-line)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            History
          </p>
          <p className="truncate font-mono text-xs text-[color:var(--topo-accent)]">
            {caseKey}
          </p>
          <p className="truncate text-sm font-medium text-[color:var(--topo-ink)]">
            {caseTitle}
          </p>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          aria-label="Close history"
          className="min-w-0 px-2"
          onPress={onClose}
        >
          <XIcon size={14} weight="bold" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="text-sm text-[color:var(--topo-muted)]">Loading activity…</p>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <ClockCounterClockwiseIcon
              size={22}
              className="text-[color:var(--topo-muted)]"
            />
            <p className="text-sm text-[color:var(--topo-muted)]">
              No changes recorded yet.
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {activities.map((a) => {
              const who =
                a.actorName?.trim() ||
                a.actorEmail?.trim() ||
                "Someone";
              return (
                <li
                  key={a.id}
                  className="relative border-l-2 border-[color:var(--topo-line)] pl-3"
                >
                  <p className="text-sm text-[color:var(--topo-ink)]">{a.summary}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[color:var(--topo-muted)]">
                    {who} · {formatWhen(a.createdAt)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
