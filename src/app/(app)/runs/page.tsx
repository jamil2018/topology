import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { RunsWorkspace } from "@/components/runs-workspace";
import { RunsPageSkeleton } from "@/components/skeletons";
import { resolveActiveProject } from "@/lib/project";
import { listRuns, listSavedViews } from "@/lib/queries";
import { runListQueryFromSearchParams } from "@/lib/run-list";
import { ensureMembership } from "@/lib/workspace";

export const metadata: Metadata = {
  title: pageTitle("Test runs"),
  description: "Start and continue manual test runs.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RunsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const raw = await searchParams;
  if (raw.new === "1") redirect("/runs/new");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
  }
  const query = runListQueryFromSearchParams(params);
  query.kind = "manual";
  // Workspace still filters/paginates client-side; load the full matching set.
  query.all = true;
  const [listed, views] = await Promise.all([
    listRuns(workspaceId, query),
    listSavedViews(workspaceId, "runs", session.user.id),
  ]);
  const runs = listed.items;

  return (
    <Suspense fallback={<RunsPageSkeleton />}>
      <RunsWorkspace
          initialRuns={runs.map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            environment: r.environment,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            passed: r.passed,
            failed: r.failed,
            skipped: r.skipped,
            blocked: r.blocked,
            untested: r.untested,
            total: r.total,
            assigneeName: r.assigneeName,
          }))}
          initialViews={views}
        />
    </Suspense>
  );
}
