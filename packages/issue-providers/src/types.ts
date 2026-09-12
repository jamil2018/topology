export type IssueProviderId = "jira" | "linear" | "github" | "mock";

export type RemoteIssueStatus = "open" | "in_progress" | "done" | "unknown";

export type CreateIssueInput = {
  title: string;
  description: string;
  labels?: string[];
  /** Jira project key, e.g. TOP */
  projectKey?: string;
  /** Linear team id */
  teamId?: string;
  /** GitHub `owner/repo` */
  repo?: string;
};

export type RemoteIssue = {
  provider: IssueProviderId;
  id: string;
  key: string;
  url: string;
  title: string;
  status: RemoteIssueStatus;
};

export type IssueProviderConfig = {
  /** Injected for tests — defaults to global fetch */
  fetch?: typeof fetch;
  baseUrl?: string;
  token?: string;
  email?: string;
  defaultProjectKey?: string;
  defaultTeamId?: string;
  defaultRepo?: string;
};

export interface IssueProvider {
  readonly id: IssueProviderId;
  createIssue(input: CreateIssueInput): Promise<RemoteIssue>;
  getIssue(idOrKey: string): Promise<RemoteIssue>;
  linkExisting(idOrKey: string): Promise<RemoteIssue>;
}

export function buildFailureIssueBody(ctx: {
  caseKey?: string;
  caseTitle?: string;
  resultStatus?: string;
  notes?: string;
  runName?: string;
  runId?: string;
  environment?: string;
  commitSha?: string;
  ciUrl?: string;
}): string {
  const lines = [
    "## Failure context",
    "",
    ctx.caseKey ? `- Case: \`${ctx.caseKey}\` — ${ctx.caseTitle ?? ""}` : null,
    ctx.resultStatus ? `- Result: **${ctx.resultStatus}**` : null,
    ctx.runName ? `- Run: ${ctx.runName}${ctx.runId ? ` (\`${ctx.runId}\`)` : ""}` : null,
    ctx.environment ? `- Environment: ${ctx.environment}` : null,
    ctx.commitSha ? `- Commit: \`${ctx.commitSha}\`` : null,
    ctx.ciUrl ? `- CI: ${ctx.ciUrl}` : null,
    "",
    "### Notes",
    ctx.notes?.trim() || "_No notes_",
    "",
    "_Filed from Topology_",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function mapGenericStatus(raw: string | undefined | null): RemoteIssueStatus {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (
    ["done", "closed", "resolved", "complete", "completed", "fixed", "merged"].some(
      (x) => s.includes(x),
    )
  ) {
    return "done";
  }
  if (s.includes("progress") || s.includes("started") || s.includes("review")) {
    return "in_progress";
  }
  if (
    ["todo", "open", "reopened", "backlog", "new", "triage", "ready"].some((x) =>
      s.includes(x),
    )
  ) {
    return "open";
  }
  return "unknown";
}
