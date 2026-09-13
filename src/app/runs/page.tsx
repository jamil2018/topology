import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { RunsWorkspace } from "@/components/runs-workspace";
import { RunsPageSkeleton } from "@/components/skeletons";
import { resolveActiveProject } from "@/lib/project";
import { projectShellProps } from "@/lib/project-shell";
import { listRuns, listSavedViews } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

type Props = {
  searchParams: Promise<{ new?: string }>;
};

export default async function RunsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  if (params.new === "1") redirect("/runs/new");

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
  const [runs, views] = await Promise.all([
    listRuns(workspaceId, "manual"),
    listSavedViews(workspaceId, "runs", session.user.id),
  ]);

  return (
    <HubShell userEmail={session.user.email} {...shell}>
      <Suspense fallback={<RunsPageSkeleton />}>
        <RunsWorkspace
          initialRuns={runs.map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            environment: r.environment,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }))}
          initialViews={views}
        />
      </Suspense>
    </HubShell>
  );
}
