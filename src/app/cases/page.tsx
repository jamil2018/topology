import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { CasesWorkspace } from "@/components/cases-workspace";
import { CasesPageSkeleton } from "@/components/skeletons";
import { listCases, listFolders, listSavedViews } from "@/lib/queries";

export default async function CasesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [cases, folders, views] = await Promise.all([
    listCases(),
    listFolders(),
    listSavedViews("cases", session.user.id),
  ]);

  return (
    <HubShell userEmail={session.user.email}>
      <Suspense fallback={<CasesPageSkeleton />}>
        <CasesWorkspace
          initialCases={cases.map((c) => ({
            id: c.id,
            key: c.key,
            title: c.title,
            priority: c.priority,
            status: c.status,
            tags: c.tags,
            folder: c.folder
              ? { id: c.folder.id, name: c.folder.name }
              : null,
          }))}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          initialViews={views}
        />
      </Suspense>
    </HubShell>
  );
}
