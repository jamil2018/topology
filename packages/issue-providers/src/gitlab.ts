import { providerFetch, readJson } from "./http";
import {
  mapGenericStatus,
  type CreateIssueInput,
  type IssueProvider,
  type IssueProviderConfig,
  type RemoteIssue,
  type TransitionIssueInput,
  type UpdateIssueInput,
} from "./types";

type GlIssue = {
  id: number;
  iid: number;
  title: string;
  web_url: string;
  state: string;
};

function gitlabApiBase(baseUrl?: string): string {
  const raw = (baseUrl ?? "https://gitlab.com").replace(/\/$/, "");
  if (raw.endsWith("/api/v4")) return raw;
  return `${raw}/api/v4`;
}

function mapGlStatus(issue: GlIssue) {
  if (issue.state === "closed") return "done" as const;
  if (issue.state === "opened") return "open" as const;
  return mapGenericStatus(issue.state);
}

function toRemote(data: GlIssue): RemoteIssue {
  return {
    provider: "gitlab",
    id: String(data.id),
    key: `#${data.iid}`,
    url: data.web_url,
    title: data.title,
    status: mapGlStatus(data),
  };
}

function issueIid(idOrKey: string): string {
  return idOrKey.replace(/^#/, "");
}

function stateEvent(status: UpdateIssueInput["status"]): "close" | "reopen" | undefined {
  if (status === "done") return "close";
  if (status === "open" || status === "in_progress") return "reopen";
  return undefined;
}

export function createGitlabIssuesProvider(
  config: IssueProviderConfig,
): IssueProvider {
  const apiBase = gitlabApiBase(config.baseUrl);
  if (!config.token) throw new Error("GitLab provider requires token");

  function headers(): HeadersInit {
    return {
      "PRIVATE-TOKEN": config.token ?? "",
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  function projectPath(override?: string): string {
    const project = override ?? config.defaultRepo;
    if (!project) throw new Error("GitLab requires defaultRepo (group/project)");
    return encodeURIComponent(project);
  }

  async function getIssue(idOrKey: string): Promise<RemoteIssue> {
    const project = projectPath();
    const iid = issueIid(idOrKey);
    const res = await providerFetch(
      config,
      `${apiBase}/projects/${project}/issues/${encodeURIComponent(iid)}`,
      { headers: headers() },
    );
    const data = await readJson<GlIssue>(res);
    return toRemote(data);
  }

  async function updateIssue(
    idOrKey: string,
    input: UpdateIssueInput,
  ): Promise<RemoteIssue> {
    const project = projectPath();
    const iid = issueIid(idOrKey);
    const body: Record<string, unknown> = {};
    if (input.title) body.title = input.title;
    if (input.description) body.description = input.description;
    const event = stateEvent(input.status);
    if (event) body.state_event = event;
    const res = await providerFetch(
      config,
      `${apiBase}/projects/${project}/issues/${encodeURIComponent(iid)}`,
      {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(body),
      },
    );
    const data = await readJson<GlIssue>(res);
    return toRemote(data);
  }

  async function transition(
    idOrKey: string,
    input: TransitionIssueInput,
  ): Promise<RemoteIssue> {
    return updateIssue(idOrKey, { status: input.status });
  }

  return {
    id: "gitlab",
    async createIssue(input: CreateIssueInput): Promise<RemoteIssue> {
      const project = projectPath(input.repo);
      const res = await providerFetch(
        config,
        `${apiBase}/projects/${project}/issues`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            title: input.title,
            description: input.description,
            labels: (input.labels ?? []).join(","),
          }),
        },
      );
      const data = await readJson<GlIssue>(res);
      return toRemote(data);
    },
    getIssue,
    linkExisting: getIssue,
    updateIssue,
    transition,
  };
}
