import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { projectShellProps } from "@/lib/project-shell";
import { resolveActiveProject } from "@/lib/project";
import { ensureMembership } from "@/lib/workspace";

/** Shared shell. `loading.tsx` fills `{children}` so the sidebar stays mounted. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);

  return (
    <HubShell userEmail={session.user.email} {...projectShellProps(ctx)}>
      {children}
    </HubShell>
  );
}
