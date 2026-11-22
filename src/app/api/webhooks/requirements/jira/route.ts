import {
  jiraRequirementTarget, parseJiraRequirementEvent, readJiraWebhookBody, validJiraRequirementSignature,
} from "@/lib/jira-requirement-webhook";
import { resolveInboundWorkspaceId } from "@/lib/issue-inbound-webhooks";
import { applyJiraRequirementUpdate } from "@/lib/jira-requirements";

export async function POST(request: Request) {
  const signature = request.headers.get("x-hub-signature");
  if (!signature) return Response.json({ error: "Invalid Jira webhook signature" }, { status: 401 });
  const workspaceId = resolveInboundWorkspaceId(request);
  if (!workspaceId) return Response.json({ error: "A Topology workspace ID is required" }, { status: 400 });
  const target = jiraRequirementTarget(workspaceId);
  if (!target) return Response.json({ error: "Invalid Jira webhook signature" }, { status: 401 });
  const body = await readJiraWebhookBody(request);
  if (!body) return Response.json({ error: "Jira webhook body is too large" }, { status: 413 });
  if (!validJiraRequirementSignature(body, signature, target.secret)) {
    return Response.json({ error: "Invalid Jira webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseJiraRequirementEvent(payload, target);
  if (parsed.status === "invalid") return Response.json({ error: "Invalid Jira issue payload" }, { status: 400 });
  if (parsed.status !== "update") return Response.json(parsed);
  const result = await applyJiraRequirementUpdate(target, parsed.event);
  return Response.json(result, { status: result.status === "conflict" ? 409 : 200 });
}
