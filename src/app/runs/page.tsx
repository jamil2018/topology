import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { RunsWorkspace } from "@/components/runs-workspace";
import { listCases, listFolders, listRuns, listSavedViews } from "@/lib/queries";

export default async function RunsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [runs, cases, folders, views] = await Promise.all([
    listRuns("manual"),
    listCases(),
    listFolders(),
    listSavedViews("runs", session.user.id),
  ]);

  return (
    <HubShell userEmail={session.user.email}>
      <Suspense
        fallback={
          <p className="text-sm text-[color:var(--topo-muted)]">Loading runs…</p>
        }
      >
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
