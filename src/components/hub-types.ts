import type { HubPersona } from "@/lib/hub-persona";

export type { HubPersona };

export type HubView = "home" | "overview";

export type RunPulse = {
  id: string;
  name: string;
  status: string;
  kind?: string;
  passed?: number;
  failed?: number;
  skipped?: number;
  blocked?: number;
  untested?: number;
  assigneeId?: string | null;
};

export type HubPulseData = {
  cases: { total: number; ready: number; blocked: number; draft: number };
  runs: {
    total: number;
    inProgress: number;
    completed: number;
    automation?: number;
  };
  results: {
    passed: number;
    failed: number;
    untested: number;
    total: number;
    passRate: number | null;
  };
  folders: number;
  recentRuns: RunPulse[];
  runTrend?: RunPulse[];
  quality?: {
    health: "healthy" | "watch" | "critical";
    signals: string[];
    triageBacklog: number;
    flakeSuspects: number;
  };
  triageOpen?: number;
  flakeSuspects?: number;
  retestQueue?: Array<{
    id: string;
    key: string;
    title: string;
    caseKey: string | null;
    runId: string | null;
    resultId: string | null;
  }>;
  coverage?: {
    requirement: { covered: number; total: number; pct: number | null };
    risk: { covered: number; total: number; pct: number | null };
    automation: { covered: number; total: number; pct: number | null };
    execution: { covered: number; total: number; pct: number | null };
    gaps: Array<{
      kind: string;
      id: string;
      key: string;
      title: string;
    }>;
    freshnessSummary?: { fresh: number; unverified: number };
  };
  journeyCoverage?: { covered: number; total: number; pct: number | null };
  assignedRuns?: RunPulse[];
  inProgressRuns?: RunPulse[];
  failingNow?: Array<{
    id: string;
    title: string;
    priority: string;
    runId: string | null;
    caseKey: string | null;
  }>;
};

export type ReleaseOption = {
  id: string;
  name: string;
  gitTag: string | null;
  sha: string | null;
};

export type MilestoneView = {
  milestone: {
    name: string;
    passRateThreshold: number;
    minExecutedPct?: number;
  };
  readiness: {
    status: "go" | "at_risk" | "no_go" | "unknown";
    score: number;
    passRate: number | null;
    executedPct?: number;
    reasons: string[];
  };
  badge: string;
} | null;

export const PERSONAS: Array<{ id: HubPersona; label: string }> = [
  { id: "em", label: "EM" },
  { id: "qa", label: "QA" },
  { id: "dev", label: "Dev" },
  { id: "pm", label: "PM" },
];

/** Client-only Hub section visibility by persona (Phase 8). */
export const PERSONA_SECTIONS: Record<
  HubPersona,
  {
    casesLink: boolean;
    quality: boolean;
    milestone: boolean;
    casesReady: boolean;
    activeRuns: boolean;
    coverage: boolean;
    gaps: boolean;
    recentRuns: boolean;
    retest: boolean;
  }
> = {
  em: {
    casesLink: false,
    quality: true,
    milestone: true,
    casesReady: false,
    activeRuns: false,
    coverage: true,
    gaps: true,
    recentRuns: false,
    retest: false,
  },
  qa: {
    casesLink: true,
    quality: true,
    milestone: true,
    casesReady: true,
    activeRuns: true,
    coverage: false,
    gaps: false,
    recentRuns: true,
    retest: true,
  },
  dev: {
    casesLink: false,
    quality: true,
    milestone: false,
    casesReady: false,
    activeRuns: true,
    coverage: true,
    gaps: true,
    recentRuns: true,
    retest: false,
  },
  pm: {
    casesLink: false,
    quality: false,
    milestone: true,
    casesReady: false,
    activeRuns: false,
    coverage: true,
    gaps: true,
    recentRuns: false,
    retest: false,
  },
};

export const ALL_HUB_SECTIONS = {
  casesLink: true,
  quality: true,
  milestone: true,
  casesReady: true,
  activeRuns: true,
  coverage: true,
  gaps: true,
  recentRuns: true,
  retest: true,
} as const;
