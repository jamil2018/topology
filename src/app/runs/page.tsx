import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { RunsWorkspace } from "@/components/runs-workspace";
import { listRuns } from "@/lib/queries";

export default async function RunsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const runs = await listRuns();

  return (
    <HubShell userEmail={session.user.email}>
      <RunsWorkspace
        initialRuns={runs.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          environment: r.environment,
          updatedAt: r.updatedAt,
        }))}
      />
    </HubShell>
  );
}
