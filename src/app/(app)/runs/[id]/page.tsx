import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { listIssueProviders } from "@topology/issue-providers";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmpty } from "@/components/no-project-empty-state";
import { RunExecutor } from "@/components/run-executor";
import { getRunWithResults, isUuid } from "@/lib/queries";
import { resolveActiveProject } from "@/lib/project";
import { ensureMembership } from "@/lib/workspace";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { runs, workspaceMembers } from "@/db/schema";

type Props = { params: Promise<{ id: string }> };

const runSession = cache(async () => auth());
const activeProject = cache(resolveActiveProject);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await runSession();
  if (!session?.user?.id) return { title: pageTitle("Test run") };
  const ctx = await activeProject(session.user.id);
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
  const session = await runSession();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await activeProject(session.user.id);
  if (!ctx) return <NoProjectEmpty userId={session.user.id} />;

  const workspaceId = ctx.project.id;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [run, members] = await Promise.all([
    getRunWithResults(workspaceId, id),
    db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.workspaceId, workspaceId),
      with: { user: { columns: { id: true, name: true, email: true } } },
    }),
  ]);
  if (!run) notFound();

  const defaultProvider = process.env.TOPOLOGY_ISSUE_PROVIDER ?? "mock";
  const availableProviders = listIssueProviders();

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
        defaultProvider={defaultProvider}
        availableProviders={availableProviders}
        run={{
          id: run.id,
          source: run.source,
          name: run.name,
          environment: run.environment,
          status: run.status,
          description: run.description,
          assigneeId: run.assigneeId,
          results: run.results.map((r) => ({
            id: r.id,
            caseId: r.caseId,
            status: r.status,
            notes: r.notes,
            durationMs: r.durationMs,
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
            case: r.caseSnapshot ?? {
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
