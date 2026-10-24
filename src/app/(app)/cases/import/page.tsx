import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ImportWorkspace } from "@/components/import-workspace";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { resolveActiveProject } from "@/lib/project";
import { ensureMembership } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Import cases · Topology",
  description:
    "Import TestRail, Qase, Zephyr Scale, or Xray cases with mapping preview and dry run.",
};

export default async function ImportCasesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  return <ImportWorkspace />;
}
