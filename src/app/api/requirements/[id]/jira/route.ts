import { z } from "zod";
import { auth } from "@/auth";
import { jiraIdSchema, jiraRequirementTarget } from "@/lib/jira-requirement-webhook";
import { bindJiraRequirement, listJiraRequirementRevisions, reviewJiraCoverage } from "@/lib/jira-requirements";
import { requireProjectAccess } from "@/lib/project";

type Params = { params: Promise<{ id: string }> };

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bind"), issueId: jiraIdSchema }),
  z.object({ action: z.literal("review"), edgeId: z.string().uuid(), revision: z.number().int().positive() }),
]);

export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, action: "requirements.view" });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "Invalid requirement ID" }, { status: 400 });
  const before = new URL(request.url).searchParams.get("beforeRevision");
  const cursor = z.coerce.number().int().min(1).max(2_147_483_647).optional().safeParse(before ?? undefined);
  if (!cursor.success) return Response.json({ error: "Invalid Jira revision cursor" }, { status: 400 });
  const history = await listJiraRequirementRevisions(access.ctx.project.id, id, cursor.data);
  return history ? Response.json(history) : Response.json({ error: "Jira requirement source not found" }, { status: 404 });
}

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, action: "requirements.edit" });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { id: requirementId } = await params;
  if (!z.string().uuid().safeParse(requirementId).success) return Response.json({ error: "Invalid requirement ID" }, { status: 400 });
  const result = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return Response.json({ error: "Invalid Jira requirement action" }, { status: 400 });
  const { data } = result;
  const workspaceId = access.ctx.project.id;
  const scope = { workspaceId, requirementId, actorId: session.user.id };
  if (data.action === "bind") {
    const admin = await requireProjectAccess(session.user.id, { request, action: "project.manage" });
    if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });
    const target = jiraRequirementTarget(workspaceId);
    if (!target) return Response.json({ error: "Jira requirement sync is not configured for this project" }, { status: 409 });
    const outcome = await bindJiraRequirement({ ...scope, target, issueId: data.issueId });
    if (outcome.status === "conflict") return Response.json({ error: "This issue or requirement already has a Jira mapping" }, { status: 409 });
    if (outcome.status === "not_found") return Response.json({ error: "Requirement not found" }, { status: 404 });
    return Response.json(outcome);
  }

  const outcome = await reviewJiraCoverage({ ...scope, edgeId: data.edgeId, revision: data.revision });
  if (outcome.status === "conflict") return Response.json({ error: "The Jira revision changed. Refresh and review the new revision." }, { status: 409 });
  if (outcome.status === "not_found") return Response.json({ error: "Coverage link not found" }, { status: 404 });
  return Response.json(outcome);
}
