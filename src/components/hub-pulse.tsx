"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";
import { useQualityGraph } from "./quality-graph-provider";
import { parseHubPersona, type HubPersona } from "@/lib/hub-persona";
import { OverviewDashboard } from "./overview-dashboard";
import { QaHome } from "./qa-home";
import {
  PERSONAS,
  type HubPulseData,
  type HubView,
  type MilestoneView,
  type ReleaseOption,
} from "./hub-types";

export type { HubPersona, HubPulseData as Pulse, HubView };
export { parseHubPersona };

function parseHubView(raw: string | null | undefined): HubView {
  return raw === "overview" ? "overview" : "home";
}

export function HubPulse({
  pulse,
  milestone,
  releases = [],
  selectedReleaseId = null,
  initialPersona = null,
  initialView = "home",
}: {
  pulse: HubPulseData;
  milestone: MilestoneView;
  releases?: ReleaseOption[];
  selectedReleaseId?: string | null;
  initialPersona?: HubPersona | null;
  initialView?: HubView;
}) {
  const { enabled: qualityGraphEnabled } = useQualityGraph();
  const health = pulse.quality?.health ?? "healthy";
  const selectedRelease =
    releases.find((r) => r.id === selectedReleaseId) ?? releases[0] ?? null;
  const router = useRouter();
  const [view, setViewState] = useState<HubView>(parseHubView(initialView));
  const [persona, setPersonaState] = useState<HubPersona | null>(initialPersona);

  function replaceQuery(next: {
    view?: HubView;
    persona?: HubPersona | null;
    releaseId?: string | null;
  }) {
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    const nextView = next.view ?? view;
    const nextPersona = next.persona === undefined ? persona : next.persona;
    const nextRelease =
      next.releaseId === undefined
        ? selectedRelease?.id
        : next.releaseId;
    if (nextView === "overview") params.set("view", "overview");
    else params.delete("view");
    if (nextPersona) params.set("persona", nextPersona);
    else params.delete("persona");
    if (nextRelease) params.set("release", nextRelease);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  function setView(next: HubView) {
    setViewState(next);
    replaceQuery({ view: next });
  }

  function setPersona(next: HubPersona | null) {
    setPersonaState(next);
    replaceQuery({ persona: next, view: "overview" });
  }

  const isOverview = view === "overview";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operating hub"
        title={isOverview ? "Quality pulse" : "QA home"}
        description={
          isOverview
            ? "Persona pulse, milestone gates, and optional graph coverage. Testers live on QA home."
            : "Your assigned runs, work in progress, open failures, and the retest queue."
        }
        meta={
          <>
            <StatusChip tone={statusToneForRun(health)}>{health}</StatusChip>
            {(pulse.triageOpen ?? 0) > 0 ? (
              <StatusChip tone="danger">
                {pulse.triageOpen} open triage
              </StatusChip>
            ) : (
              <StatusChip tone="success">Triage clear</StatusChip>
            )}
            {isOverview && milestone ? (
              <StatusChip tone={statusToneForRun(milestone.readiness.status)}>
                {milestone.badge}
              </StatusChip>
            ) : null}
            {isOverview && selectedRelease ? (
              <StatusChip mono>{selectedRelease.name}</StatusChip>
            ) : null}
            {isOverview && persona ? (
              <StatusChip mono>persona {persona}</StatusChip>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <div
              role="tablist"
              aria-label="Hub view"
              className="flex flex-wrap items-center gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isOverview}
                onClick={() => setView("home")}
                className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
                  !isOverview
                    ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                QA home
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isOverview}
                onClick={() => setView("overview")}
                className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
                  isOverview
                    ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                Overview
              </button>
            </div>
            {isOverview ? (
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-0.5">
                <button
                  type="button"
                  onClick={() => setPersona(null)}
                  className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
                    persona == null
                      ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                      : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                  }`}
                >
                  All
                </button>
                {PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPersona(p.id)}
                    className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
                      persona === p.id
                        ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                        : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
            {isOverview && qualityGraphEnabled && releases.length > 0 ? (
              <label className="flex items-center gap-1.5 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-2 py-1 text-xs text-[color:var(--topo-muted)]">
                Release
                <select
                  className="bg-transparent font-medium text-[color:var(--topo-ink)] outline-none"
                  aria-label="Release switcher"
                  value={selectedRelease?.id ?? ""}
                  onChange={(e) => {
                    replaceQuery({
                      releaseId: e.target.value || null,
                      view: "overview",
                    });
                  }}
                >
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Link
              href="/cases"
              className="rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)] transition active:scale-[0.98]"
            >
              Test cases
            </Link>
            <Link
              href="/settings?section=integrations#ci"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              CI setup
            </Link>
          </div>
        }
      />

      {isOverview ? (
        <OverviewDashboard
          pulse={pulse}
          milestone={milestone}
          persona={persona}
          selectedRelease={selectedRelease}
        />
      ) : (
        <QaHome pulse={pulse} />
      )}
    </div>
  );
}
