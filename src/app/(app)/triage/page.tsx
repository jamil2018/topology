import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { TriageWorkspace } from "@/components/triage-workspace";
import { resolveActiveProject } from "@/lib/project";
import { getFlakeHints, getTriageQueue } from "@/lib/queries";

export const metadata: Metadata = {
  title: pageTitle("Triage"),
  description: "Cluster failures and file issues from recent runs.",
};

export default async function TriagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const [queue, flakes] = await Promise.all([
    getTriageQueue(workspaceId),
    getFlakeHints(workspaceId, 10),
  ]);

  return (
    <TriageWorkspace
      initialQueue={queue}
      flakeHints={flakes}
      issueProvider={process.env.TOPOLOGY_ISSUE_PROVIDER ?? "mock"}
      demoMode={process.env.NODE_ENV !== "production"}
    />
  );
}
