import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { MilestonesWorkspace } from "@/components/milestones-workspace";
import { resolveActiveProject } from "@/lib/project";
import { listMilestonesWithReadiness } from "@/lib/queries";

export const metadata: Metadata = {
  title: pageTitle("Milestones"),
  description: "Release readiness gates for this workspace.",
};

export default async function MilestonesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const milestones = await listMilestonesWithReadiness(ctx.project.id);

  return <MilestonesWorkspace initial={milestones} />;
}
