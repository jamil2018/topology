import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { ReportDetail } from "@/components/report-detail";
import { getRunReport } from "@/lib/queries";

type Props = { params: Promise<{ id: string }> };

export default async function ReportDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const report = await getRunReport(id);
  if (!report) notFound();

  return (
    <HubShell userEmail={session.user.email}>
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
