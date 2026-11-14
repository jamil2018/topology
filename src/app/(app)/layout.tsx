import { ProjectActionsProvider } from "@/components/project-actions";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { projectShellProps } from "@/lib/project-shell";
import { ctxCanAdmin, ctxCanWrite, readPreferredProjectId, resolveActiveProject } from "@/lib/project";

/** Shared shell. `loading.tsx` fills `{children}` so the sidebar stays mounted. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // The layout stays mounted, so re-read the cookie on every request.
  const preferredId = await readPreferredProjectId();
  const ctx = await resolveActiveProject(session.user.id, preferredId);

  return (
    <ProjectActionsProvider writable={ctx ? ctxCanWrite(ctx) : false} administrator={ctx ? ctxCanAdmin(ctx) : false} actions={ctx?.actions ?? []} projectId={ctx?.project.id ?? null} userId={session.user.id}>
    <HubShell userEmail={session.user.email} {...projectShellProps(ctx)}>
      {children}
    </HubShell>
    </ProjectActionsProvider>
  );
}
