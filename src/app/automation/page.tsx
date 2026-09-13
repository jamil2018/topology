import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { AutomationWorkspace } from "@/components/automation-workspace";
import { getFlakeHints, listRuns } from "@/lib/queries";

export default async function AutomationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [runs, flakeHints] = await Promise.all([
    listRuns("automation"),
    getFlakeHints(20),
  ]);

  return (
    <HubShell userEmail={session.user.email}>
      <AutomationWorkspace
        initialRuns={runs.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          source: r.source ?? "ci",
          branch: r.branch,
          commitSha: r.commitSha,
          shardTotal: r.shardTotal,
          shardsReceived: r.shardsReceived,
          updatedAt: r.updatedAt,
        }))}
        flakeHints={flakeHints}
      />
    </HubShell>
  );
}
