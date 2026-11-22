import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmpty } from "@/components/no-project-empty-state";
import { RequirementsWorkspace } from "@/components/requirements-workspace";
import { jiraRequirementTarget } from "@/lib/jira-requirement-webhook";
import { ctxHasAction, resolveActiveProject } from "@/lib/project";
import { listProjectRequirements } from "@/lib/project-requirements";

export const metadata: Metadata = {
  title: "Requirements · Topology",
};

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ requirement?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmpty userId={session.user.id} />;

  if (!ctxHasAction(ctx, "requirements.view")) redirect("/");
  const workspaceId = ctx.project.id;
  const [params, initial] = await Promise.all([searchParams, listProjectRequirements(workspaceId)]);
  const jiraConfigured = Boolean(jiraRequirementTarget(workspaceId));

  return (
    <RequirementsWorkspace
      initial={initial}
      jiraConfigured={jiraConfigured}
      selectedId={params.requirement ?? null}
    />
  );
}
