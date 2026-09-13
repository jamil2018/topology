import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { resolveActiveProject } from "@/lib/project";
import { projectShellProps } from "@/lib/project-shell";
import { resolveSettingsSection } from "@/lib/settings-sections";
import { ensureMembership } from "@/lib/workspace";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  const shell = projectShellProps(ctx);

  const params = await searchParams;
  const initialSection = resolveSettingsSection(params.section).page;

  const defaultUrl =
    process.env.AUTH_URL ??
    process.env.TOPOLOGY_URL ??
    "http://127.0.0.1:4317";

  return (
    <HubShell userEmail={session.user.email} {...shell}>
      <Suspense fallback={<SettingsPageSkeleton />}>
        <SettingsWorkspace
          defaultUrl={defaultUrl}
          initialSection={initialSection}
        />
      </Suspense>
    </HubShell>
  );
}
