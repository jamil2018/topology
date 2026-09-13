import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { MilestonesWorkspace } from "@/components/milestones-workspace";
import { listMilestonesWithReadiness } from "@/lib/queries";

export default async function MilestonesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const milestones = await listMilestonesWithReadiness();

  return (
    <HubShell userEmail={session.user.email}>
      <MilestonesWorkspace initial={milestones} />
    </HubShell>
  );
}
