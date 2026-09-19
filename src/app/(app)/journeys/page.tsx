import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { JourneysWorkspace } from "@/components/journeys-workspace";
import { db } from "@/db";
import { journeys, qualityEdges } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";

export const metadata: Metadata = {
  title: "Journeys · Topology",
};

export default async function JourneysPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const rows = await db.query.journeys.findMany({
    where: eq(journeys.workspaceId, workspaceId),
    orderBy: [asc(journeys.key)],
  });

  const edges = await db.query.qualityEdges.findMany({
    where: eq(qualityEdges.workspaceId, workspaceId),
  });

  const intentIdsByJourney = new Map<string, string[]>();
  for (const j of rows) intentIdsByJourney.set(j.id, []);
  for (const e of edges) {
    if (e.relation !== "covers" && e.relation !== "part_of") continue;
    if (e.fromType === "journey" && e.toType === "intent") {
      const list = intentIdsByJourney.get(e.fromId);
      if (list) list.push(e.toId);
    } else if (e.toType === "journey" && e.fromType === "intent") {
      const list = intentIdsByJourney.get(e.toId);
      if (list) list.push(e.fromId);
    }
  }

  const initial = rows.map((j) => ({
    ...j,
    intentIds: [...new Set(intentIdsByJourney.get(j.id) ?? [])],
  }));

  return <JourneysWorkspace initial={initial} />;
}
