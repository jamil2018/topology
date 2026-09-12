import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { SettingsWorkspace } from "@/components/settings-workspace";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const section = params.section;
  const initialSection =
    section === "preferences" ||
    section === "connections" ||
    section === "ci" ||
    section === "profile"
      ? section
      : "profile";

  const defaultUrl =
    process.env.AUTH_URL ??
    process.env.TOPOLOGY_URL ??
    "http://127.0.0.1:4317";

  return (
    <HubShell userEmail={session.user.email}>
      <Suspense
        fallback={
          <p className="text-sm text-[color:var(--topo-muted)]">Loading settings…</p>
        }
      >
        <SettingsWorkspace
          defaultUrl={defaultUrl}
          initialSection={initialSection}
        />
      </Suspense>
    </HubShell>
  );
}
