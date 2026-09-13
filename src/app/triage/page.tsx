import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { TriageWorkspace } from "@/components/triage-workspace";
import { resolveActiveProject } from "@/lib/project";
import { getFlakeHints, getTriageQueue } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export default async function TriagePage() {
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
  const [queue, flakes] = await Promise.all([
    getTriageQueue(workspaceId),
    getFlakeHints(workspaceId, 10),
  ]);

  return (
    <HubShell userEmail={session.user.email}>
      <TriageWorkspace initialQueue={queue} flakeHints={flakes} />
    </HubShell>
  );
}
