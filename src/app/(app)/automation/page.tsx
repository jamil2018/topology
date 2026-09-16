import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { AutomationWorkspace } from "@/components/automation-workspace";
import { resolveActiveProject } from "@/lib/project";
import { getFlakeHints, listRuns } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export default async function AutomationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const [runs, flakeHints] = await Promise.all([
    listRuns(workspaceId, "automation"),
    getFlakeHints(workspaceId, 20),
  ]);

  return (
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
  );
}
