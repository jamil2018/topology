"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";
import { useQualityGraph } from "./quality-graph-provider";
import { useProjectActions } from "./project-actions";
import { parseHubPersona, type HubPersona } from "@/lib/hub-persona";
import {
  parseHubViewPref,
  writeHubViewCookie,
} from "@/lib/hub-view-pref";
import { OverviewDashboard } from "./overview-dashboard";
import { QaHome } from "./qa-home";
import {
  PERSONA_ALL_HINT,
  PERSONAS,
  type HubPulseData,
  type HubView,
  type MilestoneView,
  type ReleaseOption,
} from "./hub-types";

export type { HubPersona, HubPulseData as Pulse, HubView };
export { parseHubPersona };

function hubViewKey(projectId: string) {
  return `topology:hub-view:${projectId}`;
}

function hubPersonaKey(projectId: string) {
  return `topology:hub-persona:${projectId}`;
}

function readStoredPersona(projectId: string | null): HubPersona | null {
  if (!projectId) return null;
  try {
    return parseHubPersona(window.localStorage.getItem(hubPersonaKey(projectId)));
  } catch {
    return null;
  }
}

function writeStoredView(projectId: string | null, view: HubView) {
  if (!projectId) return;
  try {
    window.localStorage.setItem(hubViewKey(projectId), view);
  } catch {
    /* Storage unavailable. */
  }
  writeHubViewCookie(projectId, view);
}

function writeStoredPersona(projectId: string | null, persona: HubPersona | null) {
  if (!projectId) return;
  try {
    if (persona) window.localStorage.setItem(hubPersonaKey(projectId), persona);
    else window.localStorage.removeItem(hubPersonaKey(projectId));
  } catch {
    /* Storage unavailable. */
  }
}

export function HubPulse({
  pulse,
  milestone,
  releases = [],
  selectedReleaseId = null,
  initialPersona,
  initialView,
  hasUrlView = false,
  hasUrlPersona = false,
}: {
  pulse: HubPulseData;
  milestone: MilestoneView;
  releases?: ReleaseOption[];
  selectedReleaseId?: string | null;
  initialPersona?: HubPersona | null;
  initialView?: HubView;
  /** True when `?view=` was present — URL wins over stored preference. */
  hasUrlView?: boolean;
  /** True when `?persona=` was present — URL wins over stored preference. */
  hasUrlPersona?: boolean;
}) {
  const { enabled: qualityGraphEnabled } = useQualityGraph();
  const { projectId } = useProjectActions();
  const health = pulse.quality?.health ?? "healthy";
  const selectedRelease =
    releases.find((r) => r.id === selectedReleaseId) ?? releases[0] ?? null;
  const router = useRouter();
  const [view, setViewState] = useState<HubView>(
    parseHubViewPref(initialView ?? "home"),
  );
  const [persona, setPersonaState] = useState<HubPersona | null>(
    initialPersona ?? null,
  );

  // View comes from SSR (URL or cookie) — no post-paint flip.
  // Keep localStorage aligned with the cookie preference when URL did not force a view.
  useEffect(() => {
    if (!projectId || hasUrlView) return;
    try {
      window.localStorage.setItem(hubViewKey(projectId), view);
    } catch {
      /* Storage unavailable. */
    }
  }, [projectId, hasUrlView, view]);

  // Persona still restores client-side when the URL did not set one.
  useEffect(() => {
    if (!projectId || hasUrlPersona) return;
    const stored = readStoredPersona(projectId);
    if (stored) setPersonaState(stored);
  }, [projectId, hasUrlPersona]);

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
    writeStoredView(projectId, next);
    replaceQuery({ view: next });
  }

  function setPersona(next: HubPersona | null) {
    setPersonaState(next);
    writeStoredPersona(projectId, next);
    writeStoredView(projectId, "overview");
    replaceQuery({ persona: next, view: "overview" });
  }

  const isOverview = view === "overview";
  const activePersonaHint =
    persona == null
      ? PERSONA_ALL_HINT
      : (PERSONAS.find((p) => p.id === persona)?.hint ?? null);
  const primaryHref = pulse.cases.total > 0 ? "/runs/new" : "/cases?new=1";
  const primaryLabel = pulse.cases.total > 0 ? "Start run" : "New case";
  const failingCount = pulse.failingNow?.length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow=""
        title={isOverview ? "Overview" : "Home"}
        description={
          isOverview
            ? "Review test results, coverage, and release readiness."
            : "Your assigned runs, work in progress, open failures, and the retest queue."
        }
        meta={isOverview ? (
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
            {isOverview && qualityGraphEnabled && selectedRelease ? (
              <StatusChip mono>{selectedRelease.name}</StatusChip>
            ) : null}
            {isOverview && persona ? (
              <StatusChip mono>persona {persona}</StatusChip>
            ) : null}
          </>
        ) : failingCount > 0 ? (
          <StatusChip tone="danger">
            {failingCount} open failure{failingCount === 1 ? "" : "s"}
          </StatusChip>
        ) : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <div
              role="group"
              aria-label="Home view"
              className="flex flex-wrap items-center gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-0.5"
            >
              <button
                type="button"
                aria-pressed={!isOverview}
                onClick={() => setView("home")}
                className={`rounded px-2 py-1 font-mono text-xs uppercase tracking-wide ${
                  !isOverview
                    ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                My work
              </button>
              <button
                type="button"
                aria-pressed={isOverview}
                onClick={() => setView("overview")}
                className={`rounded px-2 py-1 font-mono text-xs uppercase tracking-wide ${
                  isOverview
                    ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                Overview
              </button>
            </div>
            {isOverview ? (
              <div className="flex flex-col gap-1">
                <div
                  role="group"
                  aria-label="Overview persona"
                  className="flex flex-wrap items-center gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-0.5"
                >
                  <button
                    type="button"
                    title={PERSONA_ALL_HINT}
                    aria-pressed={persona == null}
                    onClick={() => setPersona(null)}
                    className={`rounded px-2 py-1 font-mono text-xs uppercase tracking-wide ${
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
                      title={p.hint}
                      aria-pressed={persona === p.id}
                      onClick={() => setPersona(p.id)}
                      className={`rounded px-2 py-1 font-mono text-xs uppercase tracking-wide ${
                        persona === p.id
                          ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                          : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {activePersonaHint ? (
                  <p className="max-w-md px-0.5 text-xs text-[color:var(--topo-muted)]">
                    {activePersonaHint}
                  </p>
                ) : null}
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
              href={isOverview ? "/cases" : primaryHref}
              className="rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)] transition active:scale-[0.98]"
            >
              {isOverview ? "Test cases" : primaryLabel}
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
