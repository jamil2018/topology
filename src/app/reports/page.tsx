import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { ReportsWorkspace } from "@/components/reports-workspace";
import { resolveActiveProject } from "@/lib/project";
import { listRunReports } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) {
    return (
      <HubShell userEmail={session.user.email}>
        <p>No accessible project.</p>
      </HubShell>
    );
  }

  let reports: Awaited<ReturnType<typeof listRunReports>> = [];
  let loadError: string | null = null;
  try {
    reports = await listRunReports(ctx.project.id);
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
