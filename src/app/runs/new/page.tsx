import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { StartRunWorkspace } from "@/components/start-run-workspace";
import { listCases, listFolders } from "@/lib/queries";

export default async function StartRunPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [cases, folders] = await Promise.all([listCases(), listFolders()]);

  return (
    <HubShell userEmail={session.user.email}>
      <StartRunWorkspace
        cases={cases.map((c) => ({
          id: c.id,
          key: c.key,
          title: c.title,
          priority: c.priority,
          status: c.status,
          tags: c.tags ?? [],
          folder: c.folder
            ? { id: c.folder.id, name: c.folder.name }
            : null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }))}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
      />
    </HubShell>
  );
}
