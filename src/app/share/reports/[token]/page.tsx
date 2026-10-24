import { notFound } from "next/navigation";
import { ReportDetail } from "@/components/report-detail";
import { getRunReport } from "@/lib/queries";
import { verifyShareToken } from "@/lib/tcm/share-token";

type Props = { params: Promise<{ token: string }> };

export default async function SharedReportPage({ params }: Props) {
  const { token } = await params;
  const verified = verifyShareToken(decodeURIComponent(token));
  if (!verified.ok || verified.payload.kind !== "run") notFound();

  const report = await getRunReport(
    verified.payload.workspaceId,
    verified.payload.targetId,
  );
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
        Shared report · read only
      </p>
      <p className="text-xs text-[color:var(--topo-muted)]">
        Export via{" "}
        <a
          className="text-[color:var(--topo-accent)] underline"
          href={`/api/share/reports/${token}/export?format=csv`}
        >
          CSV
        </a>
        ,{" "}
        <a
          className="text-[color:var(--topo-accent)] underline"
          href={`/api/share/reports/${token}/export?format=xlsx`}
        >
          XLSX
        </a>
        , or{" "}
        <a
          className="text-[color:var(--topo-accent)] underline"
          href={`/api/share/reports/${token}/export?format=pdf`}
        >
          PDF
        </a>
        .
      </p>
      <ReportDetail
        report={{
          run: report.run,
          kpis: report.kpis,
          suiteBreakdown: report.suiteBreakdown,
          timeline: report.timeline,
          failures: report.failures,
          trend: report.trend,
        }}
      />
    </div>
  );
}
