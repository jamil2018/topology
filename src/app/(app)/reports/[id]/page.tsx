import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { ReportDetail } from "@/components/report-detail";
import { resolveActiveProject } from "@/lib/project";
import { getRunReport, isUuid } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return { title: pageTitle("Report") };
  const ctx = await resolveActiveProject(session.user.id);
  const { id } = await params;
  if (!ctx || !isUuid(id)) return { title: pageTitle("Report") };
  const report = await getRunReport(ctx.project.id, id);
  return { title: pageTitle(report?.run.name ?? "Report") };
}

export default async function ReportDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const report = await getRunReport(ctx.project.id, id);
  if (!report) notFound();

  return (
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
  );
}
