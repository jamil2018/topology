import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import {
  getActiveMilestoneReadiness,
  getHubPulse,
} from "@/lib/queries";
import { HubPulse } from "@/components/hub-pulse";
import { resolveActiveProject } from "@/lib/project";
import { projectShellProps } from "@/lib/project-shell";
import { ensureMembership } from "@/lib/workspace";

export default async function HomePage() {
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
  const [pulse, milestone] = await Promise.all([
    getHubPulse(workspaceId),
    getActiveMilestoneReadiness(workspaceId),
  ]);

  return (
    <HubShell userEmail={session.user.email} {...shell}>
      <HubPulse pulse={pulse} milestone={milestone} />
    </HubShell>
  );
}
