"use client";

import { useEffect, useState } from "react";
import { StatusChip } from "./status-chip";

type AuditRow = {
  id: string;
  action: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string | Date;
};

function formatWhen(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function AuditLogPanel() {
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/audit");
      if (res.status === 403) {
        if (!cancelled) {
          setError("Only project admins can view the audit log.");
        }
        return;
      }
      if (!res.ok) throw new Error("Failed to load audit log");
      const data = (await res.json()) as { events: AuditRow[] };
      if (!cancelled) setEvents(data.events);
    })().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Load failed");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Audit log
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Logins, role changes, API tokens, webhooks, integrations, and exports.
        </p>
      </div>

      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : events.length === 0 ? (
        <p className="text-xs text-[color:var(--topo-muted)]">
          No audit events yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded border border-[color:var(--topo-line)] px-2 py-1.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip mono>{event.action}</StatusChip>
                <span className="text-xs text-[color:var(--topo-ink)]">
                  {event.actorEmail ?? "system"}
                </span>
                <span className="text-[11px] text-[color:var(--topo-muted)]">
                  {formatWhen(event.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-[color:var(--topo-muted)]">
                {event.targetType ?? "—"}
                {event.targetId ? ` ${event.targetId}` : ""}
                {event.ip ? ` · ${event.ip}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
