import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { CasesWorkspace } from "@/components/cases-workspace";
import { CasesPageSkeleton } from "@/components/skeletons";
import { resolveActiveProject } from "@/lib/project";
import { listCases, listFolders, listSavedViews } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Test Cases · Topology",
  description:
    "Organize suites in nested folders, author cases, and import or export CSV.",
};

export default async function CasesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const [cases, folders, views] = await Promise.all([
    listCases(workspaceId),
    listFolders(workspaceId),
    listSavedViews(workspaceId, "cases", session.user.id),
  ]);

  return (
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
          folders={folders.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId ?? null,
          }))}
          initialViews={views}
        />
    </Suspense>
  );
}
