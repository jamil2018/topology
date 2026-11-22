import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runTemplates, workspaceMembers } from "@/db/schema";
import { prepareRetest } from "@/lib/retest";
import { z } from "zod";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pageTitle } from "@/lib/format-labels";
import { NoProjectEmpty } from "@/components/no-project-empty-state";
import { StartRunWorkspace } from "@/components/start-run-workspace";
import { assigneeDecision } from "@/lib/assignee";
import { membershipActions, resolveActiveProject } from "@/lib/project";
import { listFolders, listPickerCases } from "@/lib/queries";
import { ensureMembership } from "@/lib/workspace";

export const metadata: Metadata = {
  title: pageTitle("New test run"),
  description: "Pick cases and start a manual test run.",
};

export default async function StartRunPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureMembership(session.user.id);
  const ctx = await resolveActiveProject(session.user.id);
  if (!ctx) return <NoProjectEmpty userId={session.user.id} />;

  const workspaceId = ctx.project.id;
  const params = await searchParams;
  const template = params.template && z.string().uuid().safeParse(params.template).success ? await db.query.runTemplates.findFirst({ where: and(eq(runTemplates.workspaceId, workspaceId), eq(runTemplates.id, params.template)) }) : undefined;
  const sourceIds = z.array(z.string().uuid()).min(1).max(500).safeParse(params.retest?.split(","));
  const retest = sourceIds.success ? await prepareRetest(workspaceId, sourceIds.data) : null;
  if ((params.template && !template) || (params.retest && !retest)) return <p role="alert">This draft is unavailable in the current project. Return to Test runs and try again.</p>;
  const memberships = await db.query.workspaceMembers.findMany({ where: eq(workspaceMembers.workspaceId, workspaceId), with: { user: true, customRole: true } });

  const [cases, folders] = await Promise.all([
    listPickerCases(workspaceId),
    listFolders(workspaceId),
  ]);

  return (
    <StartRunWorkspace
        initialTemplate={template}
        editTemplate={params.editTemplate === "1"}
        retest={retest}
        members={memberships.filter((member) => member.user && assigneeDecision({ role: member.role, actions: membershipActions(member) }, "runs.edit").ok).map((member) => ({ id: member.user.id, label: member.user.name || member.user.email }))}
        cases={cases.map((c) => ({
          id: c.id,
          key: c.key,
          title: c.title,
          priority: c.priority,
          status: c.status,
          tags: c.tags ?? [],
          folder: c.folder,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }))}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
    />
  );
}
