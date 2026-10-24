import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { PlanDetail } from "@/components/plan-detail";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { resolveActiveProject } from "@/lib/project";
import { isUuid, listCases } from "@/lib/queries";
import { getPlan } from "@/lib/tcm/plans";
import { ensureMembership } from "@/lib/workspace";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return { title: pageTitle("Plan") };
  const ctx = await resolveActiveProject(session.user.id);
  const { id } = await params;
  if (!ctx || !isUuid(id)) return { title: pageTitle("Plan") };
  const plan = await getPlan(ctx.project.id, id);
  return { title: pageTitle(plan?.name ?? "Plan") };
}

export default async function PlanDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [plan, envs, cases] = await Promise.all([
    getPlan(ctx.project.id, id),
    db.query.environments.findMany({
      where: eq(environments.workspaceId, ctx.project.id),
    }),
    listCases(ctx.project.id),
  ]);
  if (!plan) notFound();

  return (
    <PlanDetail
      plan={{
        id: plan.id,
        name: plan.name,
        description: plan.description,
        status: plan.status,
        matrix: plan.matrix,
        cases: plan.cases.map((row) => ({
          id: row.id,
          caseId: row.caseId,
          case: row.case
            ? {
                id: row.case.id,
                key: row.case.key,
                title: row.case.title,
                status: row.case.status,
              }
            : null,
        })),
        runs: plan.runs.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
        })),
      }}
      environments={envs.map((e) => ({ id: e.id, name: e.name }))}
      cases={cases.map((c) => ({
        id: c.id,
        key: c.key,
        title: c.title,
        status: c.status,
      }))}
    />
  );
}
