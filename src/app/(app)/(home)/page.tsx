import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
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
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const [pulse, milestone] = await Promise.all([
    getHubPulse(workspaceId),
    getActiveMilestoneReadiness(workspaceId),
  ]);

  return <HubPulse pulse={pulse} milestone={milestone} />;
}
