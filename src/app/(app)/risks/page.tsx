import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { GraphEntityWorkspace } from "@/components/graph-entity-workspace";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { db } from "@/db";
import { risks } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";

export const metadata: Metadata = {
  title: "Risks · Topology",
};

export default async function RisksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const rows = await db.query.risks.findMany({
    where: eq(risks.workspaceId, ctx.project.id),
    orderBy: [asc(risks.key)],
  });

  return (
    <GraphEntityWorkspace
      kind="risks"
      title="Risks"
      description="Risks mitigated by test intents. Hub risk coverage stays N/A until risks exist."
      apiPath="/api/risks"
      initial={rows}
    />
  );
}
