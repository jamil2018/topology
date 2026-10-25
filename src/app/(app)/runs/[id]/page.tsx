import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmptyState } from "@/components/no-project-empty-state";
import { RunExecutor } from "@/components/run-executor";
import { getRunWithResults, isUuid } from "@/lib/queries";
import { resolveActiveProject } from "@/lib/project";
import { ensureMembership } from "@/lib/workspace";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { runs, workspaceMembers } from "@/db/schema";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return { title: pageTitle("Test run") };
  const ctx = await resolveActiveProject(session.user.id);
  const { id } = await params;
  if (!ctx || !isUuid(id)) return { title: pageTitle("Test run") };
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, id),
    columns: { name: true, workspaceId: true },
  });
  if (!run || run.workspaceId !== ctx.project.id) {
    return { title: pageTitle("Test run") };
  }
  return { title: pageTitle(run.name) };
}

export default async function RunDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmptyState />;

  const workspaceId = ctx.project.id;
  const members = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.workspaceId, workspaceId),
    with: { user: true },
  });

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const run = await getRunWithResults(workspaceId, id);
  if (!run) notFound();

  return (
    <RunExecutor
        currentUserId={session.user.id}
        currentUser={{
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? "",
        }}
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
            iterationIndex: r.iterationIndex,
            iterationValuesJson: r.iterationValuesJson,
            stepResults: (r.stepResults ?? []).map((s) => ({
              id: s.id,
              position: s.position,
              action: s.action,
              expected: s.expected,
              data: s.data,
              status: s.status,
              notes: s.notes,
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
  );
}
