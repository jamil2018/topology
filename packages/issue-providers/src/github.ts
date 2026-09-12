import { providerFetch, readJson } from "./http";
import {
  mapGenericStatus,
  type CreateIssueInput,
  type IssueProvider,
  type IssueProviderConfig,
  type RemoteIssue,
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

  async function getIssue(idOrKey: string): Promise<RemoteIssue> {
    const repo = config.defaultRepo;
    if (!repo) throw new Error("GitHub get requires defaultRepo");
    const { owner, name } = parseRepo(repo);
    const number = idOrKey.replace(/^#/, "");
    const res = await providerFetch(
      config,
      `${apiBase}/repos/${owner}/${name}/issues/${encodeURIComponent(number)}`,
      { headers: headers() },
    );
    const data = await readJson<GhIssue>(res);
    return {
      provider: "github",
      id: String(data.id),
      key: `#${data.number}`,
      url: data.html_url,
      title: data.title,
      status: mapGhStatus(data),
    };
  }

  return {
    id: "github",
    async createIssue(input: CreateIssueInput): Promise<RemoteIssue> {
      const repo = input.repo ?? config.defaultRepo;
      if (!repo) throw new Error("GitHub create requires repo");
      const { owner, name } = parseRepo(repo);
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
      return {
        provider: "github",
        id: String(data.id),
        key: `#${data.number}`,
        url: data.html_url,
        title: data.title,
        status: mapGhStatus(data),
      };
    },
    getIssue,
    linkExisting: getIssue,
  };
}
