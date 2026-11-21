import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmpty } from "@/components/no-project-empty-state";
import { MilestoneDetail } from "@/components/milestone-detail";
import { resolveActiveProject } from "@/lib/project";
import { getMilestoneDetail, isUuid } from "@/lib/queries";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return { title: pageTitle("Milestone") };
  const ctx = await resolveActiveProject(session.user.id);
  const { id } = await params;
  if (!ctx || !isUuid(id)) return { title: pageTitle("Milestone") };
  const detail = await getMilestoneDetail(ctx.project.id, id);
  return { title: pageTitle(detail?.milestone.name ?? "Milestone") };
}

export default async function MilestoneDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmpty userId={session.user.id} />;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const detail = await getMilestoneDetail(ctx.project.id, id);
  if (!detail) notFound();

  return <MilestoneDetail detail={detail} />;
}
