import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { GraphEntityWorkspace } from "@/components/graph-entity-workspace";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { db } from "@/db";
import { components } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";

export const metadata: Metadata = {
  title: "Components · Topology",
};

export default async function ComponentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const rows = await db.query.components.findMany({
    where: eq(components.workspaceId, ctx.project.id),
    orderBy: [asc(components.key)],
  });

  return (
    <GraphEntityWorkspace
      kind="components"
      title="Components"
      description="Code areas mapped via path rules for change impact. Link intents with belongs_to edges."
      apiPath="/api/components"
      initial={rows}
    />
  );
}
