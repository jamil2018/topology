import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import {
  ReleasesWorkspace,
  type ReleaseListItem,
} from "@/components/releases-workspace";
import { db } from "@/db";
import { releaseSnapshots, releases } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";
import { parseStoredSnapshot } from "@/lib/release-quality";

export const metadata: Metadata = {
  title: "Releases · Topology",
};

export default async function ReleasesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const rows = await db.query.releases.findMany({
    where: eq(releases.workspaceId, workspaceId),
    orderBy: [desc(releases.releasedAt), desc(releases.createdAt)],
    with: { milestone: true },
  });

  const releaseIds = rows.map((r) => r.id);
  const snapshots =
    releaseIds.length === 0
      ? []
      : await db.query.releaseSnapshots.findMany({
          where: inArray(releaseSnapshots.releaseId, releaseIds),
          orderBy: [desc(releaseSnapshots.createdAt)],
        });

  const latestByRelease = new Map<string, (typeof snapshots)[number]>();
  for (const snap of snapshots) {
    if (!latestByRelease.has(snap.releaseId)) {
      latestByRelease.set(snap.releaseId, snap);
    }
  }

  const initial: ReleaseListItem[] = rows.map((r) => {
    const snap = latestByRelease.get(r.id) ?? null;
    return {
      id: r.id,
      name: r.name,
      gitTag: r.gitTag,
      sha: r.sha,
      milestoneId: r.milestoneId,
      milestoneName: r.milestone?.name ?? null,
      releasedAt: r.releasedAt,
      snapshot: snap
        ? {
            id: snap.id,
            createdAt: snap.createdAt,
            payload: parseStoredSnapshot(snap.payloadJson),
          }
        : null,
    };
  });

  return <ReleasesWorkspace initial={initial} />;
}
