import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { ConnectAgentPanel } from "@/components/connect-agent-panel";

export default async function ConnectPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const defaultUrl =
    process.env.AUTH_URL ??
    process.env.TOPOLOGY_URL ??
    "http://127.0.0.1:4317";

  return (
    <HubShell userEmail={session.user.email}>
      <ConnectAgentPanel defaultUrl={defaultUrl} />
    </HubShell>
  );
}
