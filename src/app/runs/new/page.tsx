import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { StartRunWorkspace } from "@/components/start-run-workspace";
import { resolveActiveProject } from "@/lib/project";
import { projectShellProps } from "@/lib/project-shell";
import { listCases, listFolders } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export default async function StartRunPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
  const [cases, folders] = await Promise.all([
    listCases(workspaceId),
    listFolders(workspaceId),
  ]);

  return (
    <HubShell userEmail={session.user.email} {...shell}>
      <StartRunWorkspace
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
      />
    </HubShell>
  );
}
