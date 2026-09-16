import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { TriageWorkspace } from "@/components/triage-workspace";
import { resolveActiveProject } from "@/lib/project";
import { getFlakeHints, getTriageQueue } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export default async function TriagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const [queue, flakes] = await Promise.all([
    getTriageQueue(workspaceId),
    getFlakeHints(workspaceId, 10),
  ]);

  return <TriageWorkspace initialQueue={queue} flakeHints={flakes} />;
}
