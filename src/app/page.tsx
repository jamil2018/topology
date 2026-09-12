import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { getHubPulse } from "@/lib/queries";
import { HubPulse } from "@/components/hub-pulse";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const pulse = await getHubPulse();

  return (
    <HubShell userEmail={session.user.email}>
      <HubPulse pulse={pulse} />
    </HubShell>
  );
}
