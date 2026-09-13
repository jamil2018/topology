import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { ReportDetail } from "@/components/report-detail";
import { resolveActiveProject } from "@/lib/project";
import { projectShellProps } from "@/lib/project-shell";
import { getRunReport } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

type Props = { params: Promise<{ id: string }> };

export default async function ReportDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  const shell = projectShellProps(ctx);
  if (!ctx) {
    return (
      <HubShell userEmail={session.user.email} {...projectShellProps(null)}>
        <NoProjectEmptyState />
      </HubShell>
    );
  }

  const { id } = await params;
  const report = await getRunReport(ctx.project.id, id);
  if (!report) notFound();

  return (
    <HubShell userEmail={session.user.email} {...shell}>
      <ReportDetail
        report={{
          run: {
            ...report.run,
            startedAt: report.run.startedAt,
            completedAt: report.run.completedAt,
            createdAt: report.run.createdAt,
            updatedAt: report.run.updatedAt,
          },
          kpis: report.kpis,
          suiteBreakdown: report.suiteBreakdown,
          timeline: report.timeline,
          failures: report.failures,
          trend: report.trend,
        }}
      />
    </HubShell>
  );
}
