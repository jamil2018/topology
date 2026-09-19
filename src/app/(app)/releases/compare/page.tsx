import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { ReleaseCompare } from "@/components/release-compare";
import { db } from "@/db";
import { releases } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";

export const metadata: Metadata = {
  title: "Compare releases · Topology",
};

export default async function ReleaseComparePage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; after?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const params = await searchParams;
  const rows = await db.query.releases.findMany({
    where: eq(releases.workspaceId, ctx.project.id),
    orderBy: [desc(releases.releasedAt), desc(releases.createdAt)],
    columns: { id: true, name: true },
  });

  return (
    <ReleaseCompare
      releases={rows}
      initialBeforeId={params.before ?? null}
      initialAfterId={params.after ?? null}
    />
  );
}
