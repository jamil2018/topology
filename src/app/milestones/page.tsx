import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { MilestonesWorkspace } from "@/components/milestones-workspace";
import { resolveActiveProject } from "@/lib/project";
import { listMilestonesWithReadiness } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export default async function MilestonesPage() {
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

  const milestones = await listMilestonesWithReadiness(ctx.project.id);

  return (
    <HubShell userEmail={session.user.email}>
      <MilestonesWorkspace initial={milestones} />
    </HubShell>
  );
}
