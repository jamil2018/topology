import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import {
  ProposalsWorkspace,
  type ProposalListItem,
} from "@/components/proposals-workspace";
import { getAiProvider, listProposals } from "@/lib/proposals";
import { resolveActiveProject } from "@/lib/project";

export const metadata: Metadata = {
  title: "Proposals · Topology",
};

export default async function ProposalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const rows = await listProposals(ctx.project.id, { status: "pending" });
  const initial: ProposalListItem[] = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <ProposalsWorkspace initial={initial} aiProvider={getAiProvider()} />
  );
}
