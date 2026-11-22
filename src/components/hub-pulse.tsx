"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";
import type { Selection } from "@heroui/react";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import {
  ListChecksIcon,
  PlayIcon,
  PlusIcon,
} from "@phosphor-icons/react";
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
import { TopoSelect } from "./ui/topo-select";
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

const HOME_VIEWS = [
  { id: "home" as const, label: "My work" },
  { id: "overview" as const, label: "Overview" },
];

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

function HomeViewSwitcher({
  view,
  onViewChange,
}: {
  view: HubView;
  onViewChange: (next: HubView) => void;
}) {
  function focusTab(id: HubView) {
    const el = document.getElementById(`home-view-tab-${id}`);
    el?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const idx = HOME_VIEWS.findIndex((v) => v.id === view);
    if (idx < 0) return;
    let nextIdx = idx;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIdx = (idx + 1) % HOME_VIEWS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIdx = (idx - 1 + HOME_VIEWS.length) % HOME_VIEWS.length;
    } else if (event.key === "Home") {
      nextIdx = 0;
    } else if (event.key === "End") {
      nextIdx = HOME_VIEWS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const next = HOME_VIEWS[nextIdx]!.id;
    onViewChange(next);
    focusTab(next);
  }

  return (
    <div
      role="tablist"
      aria-label="Home view"
      className="inline-flex h-7 items-center rounded-md border border-[color:var(--topo-line)] p-0.5"
      onKeyDown={onKeyDown}
    >
      {HOME_VIEWS.map(({ id, label }) => {
        const selected = view === id;
        return (
          <button
            key={id}
            id={`home-view-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
              selected
                ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
            }`}
            onClick={() => onViewChange(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function OverviewToolbar({
  persona,
  onPersonaChange,
  qualityGraphEnabled,
  releases,
  selectedRelease,
  onReleaseChange,
}: {
  persona: HubPersona | null;
  onPersonaChange: (next: HubPersona | null) => void;
  qualityGraphEnabled: boolean;
  releases: ReleaseOption[];
  selectedRelease: ReleaseOption | null;
  onReleaseChange: (releaseId: string | null) => void;
}) {
  const activePersonaHint =
    persona == null
      ? PERSONA_ALL_HINT
      : (PERSONAS.find((p) => p.id === persona)?.hint ?? null);
  const personaKey = persona ?? "all";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <ToggleButtonGroup
          aria-label="Overview persona"
          selectionMode="single"
          disallowEmptySelection
          size="sm"
          isDetached
          selectedKeys={new Set([personaKey])}
          onSelectionChange={(keys: Selection) => {
            if (keys === "all") return;
            const next = [...keys][0];
            if (next == null || next === "all") onPersonaChange(null);
            else onPersonaChange(String(next) as HubPersona);
          }}
        >
          <ToggleButton id="all">All</ToggleButton>
          {PERSONAS.map((p) => (
            <ToggleButton key={p.id} id={p.id}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {activePersonaHint ? (
          <p className="max-w-md px-0.5 text-xs text-[color:var(--topo-muted)]">
            {activePersonaHint}
          </p>
        ) : null}
      </div>
      {qualityGraphEnabled && releases.length > 0 ? (
        <TopoSelect
          compact
          label="Release"
          ariaLabel="Release switcher"
          className="min-w-[10rem]"
          value={selectedRelease?.id ?? ""}
          onChange={(id) => onReleaseChange(id || null)}
          options={releases.map((r) => ({ id: r.id, label: r.name }))}
        />
      ) : null}
    </div>
  );
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
  const primaryHref = pulse.cases.total > 0 ? "/runs/new" : "/cases?new=1";
  const primaryLabel = pulse.cases.total > 0 ? "Start run" : "New case";
  const failingCount = pulse.failingNow?.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex w-full justify-end">
        <HomeViewSwitcher view={view} onViewChange={setView} />
      </div>

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
            {milestone ? (
              <StatusChip tone={statusToneForRun(milestone.readiness.status)}>
                {milestone.badge}
              </StatusChip>
            ) : null}
            {qualityGraphEnabled && selectedRelease ? (
              <StatusChip mono>{selectedRelease.name}</StatusChip>
            ) : null}
            {persona ? (
              <StatusChip mono>persona {persona}</StatusChip>
            ) : null}
          </>
        ) : failingCount > 0 ? (
          <StatusChip tone="danger">
            {failingCount} open failure{failingCount === 1 ? "" : "s"}
          </StatusChip>
        ) : undefined}
        actions={
          <Link
            href={isOverview ? "/cases" : primaryHref}
            className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)] transition active:scale-[0.98]"
          >
            {isOverview ? (
              <ListChecksIcon size={14} weight="bold" aria-hidden />
            ) : pulse.cases.total > 0 ? (
              <PlayIcon size={14} weight="bold" aria-hidden />
            ) : (
              <PlusIcon size={14} weight="bold" aria-hidden />
            )}
            {isOverview ? "Test cases" : primaryLabel}
          </Link>
        }
      />

      {isOverview ? (
        <>
          <OverviewToolbar
            persona={persona}
            onPersonaChange={setPersona}
            qualityGraphEnabled={qualityGraphEnabled}
            releases={releases}
            selectedRelease={selectedRelease}
            onReleaseChange={(releaseId) => {
              replaceQuery({ releaseId, view: "overview" });
            }}
          />
          <OverviewDashboard
            pulse={pulse}
            milestone={milestone}
            persona={persona}
            selectedRelease={selectedRelease}
          />
        </>
      ) : (
        <QaHome pulse={pulse} />
      )}
    </div>
  );
}
