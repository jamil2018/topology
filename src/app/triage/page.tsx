import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { TriageWorkspace } from "@/components/triage-workspace";
import { getFlakeHints, getTriageQueue } from "@/lib/queries";

export default async function TriagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [queue, flakes] = await Promise.all([
    getTriageQueue(),
    getFlakeHints(10),
  ]);

  return (
    <HubShell userEmail={session.user.email}>
      <TriageWorkspace initialQueue={queue} flakeHints={flakes} />
    </HubShell>
  );
}
