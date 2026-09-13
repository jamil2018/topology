import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { HubShell } from "@/components/hub-shell";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { RunExecutor } from "@/components/run-executor";
import { getRunWithResults } from "@/lib/queries";
import { resolveActiveProject } from "@/lib/project";
import { projectShellProps } from "@/lib/project-shell";
import { ensureMembership } from "@/lib/workspace";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { workspaceMembers } from "@/db/schema";

type Props = { params: Promise<{ id: string }> };

export default async function RunDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) {
    return (
      <HubShell userEmail={session.user.email} {...projectShellProps(null)}>
        <NoProjectEmptyState />
      </HubShell>
    );
  }

  const workspaceId = ctx.project.id;
  const shell = projectShellProps(ctx);
  const members = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.workspaceId, workspaceId),
    with: { user: true },
  });

  const { id } = await params;
  const run = await getRunWithResults(workspaceId, id);
  if (!run) notFound();

  return (
    <HubShell userEmail={session.user.email} {...shell}>
      <RunExecutor
        members={members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
        }))}
        run={{
          id: run.id,
          name: run.name,
          status: run.status,
          description: run.description,
          assigneeId: run.assigneeId,
          results: run.results.map((r) => ({
            id: r.id,
            status: r.status,
            notes: r.notes,
            assigneeId: r.assigneeId,
            comments: (r.comments ?? []).map((c) => ({
              id: c.id,
              body: c.body,
              createdAt: c.createdAt,
              user: c.user
                ? { id: c.user.id, name: c.user.name, email: c.user.email }
                : null,
            })),
            attachments: (r.attachments ?? []).map((a) => ({
              id: a.id,
              filename: a.filename,
              contentType: a.contentType,
              sizeBytes: a.sizeBytes,
              url: `/api/attachments/${a.id}`,
            })),
            linkedIssues: (r.linkedIssues ?? []).map((i) => ({
              id: i.id,
              provider: i.provider,
              remoteKey: i.remoteKey,
              url: i.url,
              title: i.title,
              remoteStatus: i.remoteStatus,
              needsRetest: i.needsRetest,
            })),
            case: {
              id: r.case?.id ?? r.caseId ?? r.id,
              key: r.case?.key ?? r.externalKey ?? "AUTO",
              title: r.case?.title ?? r.title ?? "Untitled",
              steps: r.case?.steps ?? "",
              expectedResult: r.case?.expectedResult ?? "",
            },
          })),
        }}
      />
    </HubShell>
  );
}
