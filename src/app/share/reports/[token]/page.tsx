import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportDetail } from "@/components/report-detail";
import { getRunReport } from "@/lib/queries";
import { verifyShareToken } from "@/lib/tcm/share-token";

import { isReportShareActive } from "@/lib/tcm/report-share";

// Public links must consult persisted revocation state on every request.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

async function loadSharedReport(token: string) {
  const verified = verifyShareToken(decodeURIComponent(token));
  if (!verified.ok || verified.payload.kind !== "run") return null;
  if (!(await isReportShareActive(verified.payload))) return null;
  const report = await getRunReport(
    verified.payload.workspaceId,
    verified.payload.targetId,
  );
  return report;
}

function withShareAttachmentUrls(
  report: NonNullable<Awaited<ReturnType<typeof getRunReport>>>,
  token: string,
) {
  const base = `/api/share/reports/${encodeURIComponent(token)}/attachments`;
  return {
    ...report,
    failures: report.failures.map((failure) => ({
      ...failure,
      attachments: failure.attachments.map((attachment) => ({
        ...attachment,
        url: `${base}/${attachment.id}`,
      })),
    })),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const report = await loadSharedReport(token);
  if (!report) {
    return { title: "Shared report · Topology" };
  }
  const passRate =
    report.kpis.passRate == null ? "n/a" : `${report.kpis.passRate}%`;
  const description = `${report.executive.verdictLabel} · ${passRate} pass rate · ${report.run.environment}`;
  return {
    title: `${report.run.name} · Shared report`,
    description,
    openGraph: {
      title: `${report.run.name} · Topology`,
      description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${report.run.name} · Topology`,
      description,
    },
  };
}

export default async function SharedReportPage({ params }: Props) {
  const { token } = await params;
  const report = await loadSharedReport(token);
  if (!report) notFound();

  const shared = withShareAttachmentUrls(report, token);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <ReportDetail
        publicShareToken={token}
        report={{
          run: shared.run,
          kpis: shared.kpis,
          executive: shared.executive,
          suiteBreakdown: shared.suiteBreakdown,
          timeline: shared.timeline,
          failures: shared.failures,
          trend: shared.trend,
        }}
      />
    </div>
  );
}
