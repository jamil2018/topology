import type { SuiteBreakdownRow } from "@/lib/report-stats";
import { isUuid } from "@/lib/queries/ids";

export const REPORT_RANGES = ["7d", "30d", "90d", "all"] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

export type ReportsDashboardQuery = {
  range: ReportRange;
  planId: string | null;
  environment: string | null;
};

export type ReportsDashboardKpis = {
  runs: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  executed: number;
  passRate: number | null;
};

export type ReportsTrendPoint = {
  date: string;
  passed: number;
  failed: number;
  passRate: number | null;
};

export type ReportsTesterRow = {
  id: string;
  name: string;
  executed: number;
  passed: number;
  failed: number;
  passRate: number | null;
};

export type ReportsFailingCase = {
  caseId: string | null;
  caseKey: string;
  title: string;
  failCount: number;
};

export type ReportsReadinessRow = {
  id: string;
  name: string;
  status: string;
  score: number;
  passRate: number | null;
  badge: string;
  reasons: string[];
  passRateThreshold: number;
};

export type ReportsDashboardModel = {
  query: ReportsDashboardQuery;
  options: {
    plans: Array<{ id: string; name: string }>;
    environments: string[];
  };
  kpis: ReportsDashboardKpis;
  trend: ReportsTrendPoint[];
  bySuite: SuiteBreakdownRow[];
  readiness: ReportsReadinessRow[];
  testers: ReportsTesterRow[];
  topFailing: ReportsFailingCase[];
};

function firstParam(
  value: string | string[] | undefined | null,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export function parseReportRange(
  raw: string | null | undefined,
): ReportRange {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") {
    return raw;
  }
  return "30d";
}

export function parseReportsDashboardQuery(params: {
  range?: string | string[];
  plan?: string | string[];
  environment?: string | string[];
}): ReportsDashboardQuery {
  const plan = firstParam(params.plan)?.trim() || null;
  const environment = firstParam(params.environment)?.trim() || null;
  return {
    range: parseReportRange(firstParam(params.range)),
    planId: plan && isUuid(plan) ? plan : null,
    environment: environment || null,
  };
}

export function rangeToDateBounds(
  range: ReportRange,
  now = new Date(),
): { from: Date | null; to: Date } {
  if (range === "all") return { from: null, to: now };
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    to: now,
  };
}

export function reportsDashboardSearch(
  query: ReportsDashboardQuery,
): string {
  const params = new URLSearchParams();
  if (query.range !== "30d") params.set("range", query.range);
  if (query.planId) params.set("plan", query.planId);
  if (query.environment) params.set("environment", query.environment);
  return params.toString();
}

export function filterRunReports<
  T extends {
    completedAt: string | Date | null;
    updatedAt: string | Date;
    environment: string;
    planId?: string | null;
  },
>(reports: T[], query: ReportsDashboardQuery, now = new Date()): T[] {
  const { from, to } = rangeToDateBounds(query.range, now);
  return reports.filter((report) => {
    if (query.planId && report.planId !== query.planId) return false;
    if (query.environment && report.environment !== query.environment) {
      return false;
    }
    const when = new Date(report.completedAt ?? report.updatedAt);
    if (!Number.isFinite(when.getTime())) return false;
    if (from && when < from) return false;
    return when <= to;
  });
}

export function emptyReportsDashboard(
  query: ReportsDashboardQuery = {
    range: "30d",
    planId: null,
    environment: null,
  },
): ReportsDashboardModel {
  return {
    query,
    options: { plans: [], environments: [] },
    kpis: {
      runs: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      executed: 0,
      passRate: null,
    },
    trend: [],
    bySuite: [],
    readiness: [],
    testers: [],
    topFailing: [],
  };
}
