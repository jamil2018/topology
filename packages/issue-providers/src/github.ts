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

type GhIssue = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  state_reason?: string | null;
};

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("GitHub repo must be owner/name");
  return { owner, name };
}

function mapGhStatus(issue: GhIssue) {
  if (issue.state === "closed") return "done" as const;
  return mapGenericStatus(issue.state);
}

function toRemote(data: GhIssue): RemoteIssue {
  return {
    provider: "github",
    id: String(data.id),
    key: `#${data.number}`,
    url: data.html_url,
    title: data.title,
    status: mapGhStatus(data),
  };
}

function issueNumber(idOrKey: string): string {
  return idOrKey.replace(/^#/, "");
}

function githubState(status: UpdateIssueInput["status"]): "open" | "closed" | undefined {
  if (status === "done") return "closed";
  if (status === "open" || status === "in_progress") return "open";
  return undefined;
}

export function createGithubIssuesProvider(
  config: IssueProviderConfig,
): IssueProvider {
  const apiBase = (config.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
  if (!config.token) throw new Error("GitHub provider requires token");

  function headers(): HeadersInit {
    return {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  function repoParts(override?: string): { owner: string; name: string } {
    const repo = override ?? config.defaultRepo;
    if (!repo) throw new Error("GitHub get requires defaultRepo");
    return parseRepo(repo);
  }

  async function getIssue(idOrKey: string): Promise<RemoteIssue> {
    const { owner, name } = repoParts();
    const number = issueNumber(idOrKey);
    const res = await providerFetch(
      config,
      `${apiBase}/repos/${owner}/${name}/issues/${encodeURIComponent(number)}`,
      { headers: headers() },
    );
    const data = await readJson<GhIssue>(res);
    return toRemote(data);
  }

  async function updateIssue(
    idOrKey: string,
    input: UpdateIssueInput,
  ): Promise<RemoteIssue> {
    const { owner, name } = repoParts();
    const number = issueNumber(idOrKey);
    const body: Record<string, unknown> = {};
    if (input.title) body.title = input.title;
    if (input.description) body.body = input.description;
    const state = githubState(input.status);
    if (state) body.state = state;
    const res = await providerFetch(
      config,
      `${apiBase}/repos/${owner}/${name}/issues/${encodeURIComponent(number)}`,
      {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      },
    );
    const data = await readJson<GhIssue>(res);
    return toRemote(data);
  }

  async function transition(
    idOrKey: string,
    input: TransitionIssueInput,
  ): Promise<RemoteIssue> {
    return updateIssue(idOrKey, { status: input.status });
  }

  return {
    id: "github",
    async createIssue(input: CreateIssueInput): Promise<RemoteIssue> {
      const { owner, name } = repoParts(input.repo);
      const res = await providerFetch(
        config,
        `${apiBase}/repos/${owner}/${name}/issues`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            title: input.title,
            body: input.description,
            labels: input.labels ?? [],
          }),
        },
      );
      const data = await readJson<GhIssue>(res);
      return toRemote(data);
    },
    getIssue,
    linkExisting: getIssue,
    updateIssue,
    transition,
  };
}
