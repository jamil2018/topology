import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { SettingsPageSkeleton } from "@/components/skeletons";
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

  const params = await searchParams;
  const initialSection = resolveSettingsSection(params.section).page;

  const defaultUrl =
    process.env.AUTH_URL ??
    process.env.TOPOLOGY_URL ??
    "http://127.0.0.1:4317";

  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsWorkspace
        defaultUrl={defaultUrl}
        initialSection={initialSection}
      />
    </Suspense>
  );
}
