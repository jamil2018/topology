import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { RunsWorkspace } from "@/components/runs-workspace";
import { RunsPageSkeleton } from "@/components/skeletons";
import { resolveActiveProject } from "@/lib/project";
import { listCases, listFolders, listRuns, listSavedViews } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export default async function RunsPage() {
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
  const [runs, cases, folders, views] = await Promise.all([
    listRuns(workspaceId, "manual"),
    listCases(workspaceId),
    listFolders(workspaceId),
    listSavedViews(workspaceId, "runs", session.user.id),
  ]);

  return (
    <HubShell userEmail={session.user.email}>
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
          cases={cases.map((c) => ({
            id: c.id,
            key: c.key,
            title: c.title,
            priority: c.priority,
            status: c.status,
            tags: c.tags ?? [],
            folder: c.folder
              ? { id: c.folder.id, name: c.folder.name }
              : null,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          }))}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          initialViews={views}
        />
      </Suspense>
    </HubShell>
  );
}
