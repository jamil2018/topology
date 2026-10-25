import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { CasesWorkspace } from "@/components/cases-workspace";
import { CasesPageSkeleton } from "@/components/skeletons";
import { resolveActiveProject } from "@/lib/project";
import { ensureMembership } from "@/lib/workspace";
import { loadCasesWorkspaceData } from "./cases-page-data";

export const metadata: Metadata = {
  title: "Test Cases · Topology",
  description:
    "Organize suites in nested folders, author cases, and import or export CSV.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CasesPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
  }
  const data = await loadCasesWorkspaceData(
    ctx.project.id,
    session.user.id,
    ctx.project.slug,
    params,
  );

  return (
    <Suspense fallback={<CasesPageSkeleton />}>
      <CasesWorkspace
        initialCases={data.cases}
        folders={data.folders}
        initialViews={data.views}
        projectPrefix={data.projectPrefix}
      />
    </Suspense>
  );
}
