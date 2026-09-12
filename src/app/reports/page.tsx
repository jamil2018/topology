import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { ReportsWorkspace } from "@/components/reports-workspace";
import { listRunReports } from "@/lib/queries";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  let reports: Awaited<ReturnType<typeof listRunReports>> = [];
  let loadError: string | null = null;
  try {
    reports = await listRunReports();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <HubShell userEmail={session.user.email}>
      <ReportsWorkspace
        loadError={loadError}
        reports={reports.map((r) => ({
          ...r,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
        }))}
      />
    </HubShell>
  );
}
