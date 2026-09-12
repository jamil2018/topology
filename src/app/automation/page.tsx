import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { AutomationWorkspace } from "@/components/automation-workspace";
import { listRuns } from "@/lib/queries";

export default async function AutomationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const runs = await listRuns("automation");

  return (
    <HubShell userEmail={session.user.email}>
      <AutomationWorkspace
        initialRuns={runs.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          source: r.source,
          branch: r.branch,
          commitSha: r.commitSha,
          shardTotal: r.shardTotal,
          shardsReceived: r.shardsReceived,
          updatedAt: r.updatedAt,
        }))}
      />
    </HubShell>
  );
}
