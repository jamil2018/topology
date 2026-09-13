import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import {
  getActiveMilestoneReadiness,
  getHubPulse,
} from "@/lib/queries";
import { HubPulse } from "@/components/hub-pulse";
import { resolveActiveProject } from "@/lib/project";
import { ensureMembership } from "@/lib/workspace";

export default async function HomePage() {
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

  const workspaceId = ctx.project.id;
  const [pulse, milestone] = await Promise.all([
    getHubPulse(workspaceId),
    getActiveMilestoneReadiness(workspaceId),
  ]);

  return (
    <HubShell userEmail={session.user.email}>
      <HubPulse pulse={pulse} milestone={milestone} />
    </HubShell>
  );
}
