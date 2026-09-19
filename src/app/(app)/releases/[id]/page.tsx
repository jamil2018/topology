import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { ReleaseDetail } from "@/components/release-detail";
import { db } from "@/db";
import { releaseSnapshots, releases } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";
import {
  analyzeReleaseQuality,
  parseStoredSnapshot,
} from "@/lib/release-quality";
import { isUuid } from "@/lib/queries";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = {
  title: "Release · Topology",
};

export default async function ReleaseDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const workspaceId = ctx.project.id;
  const release = await db.query.releases.findFirst({
    where: and(eq(releases.id, id), eq(releases.workspaceId, workspaceId)),
    with: { milestone: true },
  });
  if (!release) notFound();

  const [snap, quality, siblings] = await Promise.all([
    db.query.releaseSnapshots.findFirst({
      where: eq(releaseSnapshots.releaseId, id),
      orderBy: [desc(releaseSnapshots.createdAt)],
    }),
    analyzeReleaseQuality(workspaceId, { mode: "workspace" }),
    db.query.releases.findMany({
      where: eq(releases.workspaceId, workspaceId),
      orderBy: [desc(releases.releasedAt), desc(releases.createdAt)],
      columns: { id: true, name: true },
    }),
  ]);

  return (
    <ReleaseDetail
      release={{
        id: release.id,
        name: release.name,
        gitTag: release.gitTag,
        sha: release.sha,
        milestoneName: release.milestone?.name ?? null,
        releasedAt: release.releasedAt,
      }}
      snapshot={
        snap
          ? {
              id: snap.id,
              createdAt: snap.createdAt,
              payload: parseStoredSnapshot(snap.payloadJson),
            }
          : null
      }
      quality={quality.ok ? quality.quality : null}
      siblings={siblings}
    />
  );
}
