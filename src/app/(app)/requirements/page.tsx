import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { RequirementsWorkspace } from "@/components/requirements-workspace";
import { db } from "@/db";
import { qualityEdges, requirements } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";

export const metadata: Metadata = {
  title: "Requirements · Topology",
};

export default async function RequirementsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const rows = await db.query.requirements.findMany({
    where: eq(requirements.workspaceId, workspaceId),
    orderBy: [asc(requirements.key)],
  });
  const edges = await db.query.qualityEdges.findMany({
    where: and(
      eq(qualityEdges.workspaceId, workspaceId),
      eq(qualityEdges.fromType, "requirement"),
      eq(qualityEdges.relation, "covers"),
    ),
  });
  const coveredIntentIdsByReq = new Map<string, string[]>();
  for (const e of edges) {
    if (e.toType !== "intent") continue;
    const list = coveredIntentIdsByReq.get(e.fromId) ?? [];
    list.push(e.toId);
    coveredIntentIdsByReq.set(e.fromId, list);
  }

  const initial = rows.map((r) => ({
    ...r,
    coversIntentIds: coveredIntentIdsByReq.get(r.id) ?? [],
  }));

  return <RequirementsWorkspace initial={initial} />;
}
