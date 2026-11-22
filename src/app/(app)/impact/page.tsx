import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ImpactPanel } from "@/components/impact-panel";
import { NoProjectEmpty } from "@/components/no-project-empty-state";
import { PageHeader } from "@/components/page-header";
import { resolveActiveProject } from "@/lib/project";

export const metadata: Metadata = {
  title: "Impact · Topology",
};

export default async function ImpactPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmpty userId={session.user.id} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Change analysis"
        title="Commit & PR impact"
        description="See which intents, requirements, and coverage gaps are affected by a commit, pull request, or explicit path list."
      />
      <ImpactPanel />
    </div>
  );
}
