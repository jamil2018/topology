import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { PlansWorkspace } from "@/components/plans-workspace";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";
import { listPlans } from "@/lib/tcm/plans";
import { ensureMembership } from "@/lib/workspace";

export const metadata: Metadata = {
  title: pageTitle("Plans"),
  description: "Group test cases into a plan and fan out a browser × OS matrix.",
};

export default async function PlansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const [plans, envs] = await Promise.all([
    listPlans(ctx.project.id),
    db.query.environments.findMany({
      where: eq(environments.workspaceId, ctx.project.id),
    }),
  ]);

  return (
    <PlansWorkspace
      initialPlans={plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        matrix: p.matrix,
        caseCount: p.caseCount,
        runCount: p.runCount,
      }))}
      environments={envs.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
    />
  );
}
