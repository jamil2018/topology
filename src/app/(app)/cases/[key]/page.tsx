import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { CasesWorkspace } from "@/components/cases-workspace";
import { CasesPageSkeleton } from "@/components/skeletons";
import { resolveActiveProject } from "@/lib/project";
import { ensureMembership } from "@/lib/workspace";
import {
  getWorkspaceCaseByKey,
  loadCasesWorkspaceData,
} from "../cases-page-data";

type Props = {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function decodeCaseKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) {
    return { title: "Test case · Topology" };
  }
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return { title: "Test case · Topology" };
  const { key: rawKey } = await params;
  const key = decodeCaseKey(rawKey);
  const row = await getWorkspaceCaseByKey(ctx.project.id, key);
  if (!row) return { title: `${key} · Topology` };
  return {
    title: `${row.key} · ${row.title} · Topology`,
    description: `Edit ${row.key} ${row.title}`,
  };
}

export default async function CaseDetailPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const { key: rawKey } = await params;
  const selectedCaseKey = decodeCaseKey(rawKey);
  const existing = await getWorkspaceCaseByKey(
    ctx.project.id,
    selectedCaseKey,
  );
  if (!existing) notFound();

  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") query.set(key, value);
  }
  const data = await loadCasesWorkspaceData(
    ctx.project.id,
    session.user.id,
    ctx.project.slug,
    query,
  );

  return (
    <Suspense fallback={<CasesPageSkeleton />}>
      <CasesWorkspace
        initialCases={data.cases}
        folders={data.folders}
        initialViews={data.views}
        projectPrefix={data.projectPrefix}
        selectedCaseKey={selectedCaseKey}
      />
    </Suspense>
  );
}
