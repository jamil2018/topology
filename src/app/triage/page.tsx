import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { TriageWorkspace } from "@/components/triage-workspace";
import { resolveActiveProject } from "@/lib/project";
import { projectShellProps } from "@/lib/project-shell";
import { getFlakeHints, getTriageQueue } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export default async function TriagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) {
    return (
      <HubShell userEmail={session.user.email} {...projectShellProps(null)}>
        <NoProjectEmptyState />
      </HubShell>
    );
  }

  const workspaceId = ctx.project.id;
  const shell = projectShellProps(ctx);
  const [queue, flakes] = await Promise.all([
    getTriageQueue(workspaceId),
    getFlakeHints(workspaceId, 10),
  ]);

  return (
    <HubShell userEmail={session.user.email} {...shell}>
      <TriageWorkspace initialQueue={queue} flakeHints={flakes} />
    </HubShell>
  );
}
