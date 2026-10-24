import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { ReportsWorkspace } from "@/components/reports-workspace";
import { resolveActiveProject } from "@/lib/project";
import { getReportsDashboard, listRunReports } from "@/lib/queries";
import {
  emptyReportsDashboard,
  filterRunReports,
  parseReportsDashboardQuery,
} from "@/lib/report-dashboard";
import { ensureMembership } from "@/lib/workspace";

export const metadata: Metadata = {
  title: pageTitle("Reports"),
  description: "Completed run reports and pass-rate history.",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    plan?: string;
    environment?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const query = parseReportsDashboardQuery(await searchParams);
  let reports: Awaited<ReturnType<typeof listRunReports>> = [];
  let dashboard = emptyReportsDashboard(query);
  let loadError: string | null = null;
  try {
    const [listed, aggregated] = await Promise.all([
      listRunReports(ctx.project.id),
      getReportsDashboard(ctx.project.id, query),
    ]);
    reports = filterRunReports(listed, query);
    dashboard = aggregated;
  } catch {
    loadError = "Could not load reports.";
  }

  return (
    <ReportsWorkspace
        loadError={loadError}
        dashboard={dashboard}
        reports={reports.map((r) => ({
          ...r,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
        }))}
    />
  );
}
