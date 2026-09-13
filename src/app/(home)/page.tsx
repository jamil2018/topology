import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import {
  getActiveMilestoneReadiness,
  getHubPulse,
} from "@/lib/queries";
import { HubPulse } from "@/components/hub-pulse";
import { ensureMembership } from "@/lib/workspace";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);

  const [pulse, milestone] = await Promise.all([
    getHubPulse(),
    getActiveMilestoneReadiness(),
  ]);

  return (
    <HubShell userEmail={session.user.email}>
      <HubPulse pulse={pulse} milestone={milestone} />
    </HubShell>
  );
}
