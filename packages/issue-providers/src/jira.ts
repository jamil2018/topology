import { providerFetch, readJson } from "./http";
import {
  mapGenericStatus,
  type CreateIssueInput,
  type IssueProvider,
  type IssueProviderConfig,
  type RemoteIssue,
} from "./types";

type JiraCreateResponse = {
  id: string;
  key: string;
  self: string;
};

type JiraGetResponse = {
  id: string;
  key: string;
  self: string;
  fields?: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
  };
};

function browseUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/, "")}/browse/${key}`;
}

function authHeader(config: IssueProviderConfig): string {
  if (!config.email || !config.token) {
    throw new Error("Jira provider requires email + API token");
  }
  const raw = `${config.email}:${config.token}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export function createJiraProvider(config: IssueProviderConfig): IssueProvider {
  const baseUrl = (config.baseUrl ?? "").replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Jira provider requires baseUrl (e.g. https://org.atlassian.net)");
  }

  async function getIssue(idOrKey: string): Promise<RemoteIssue> {
    const res = await providerFetch(
      config,
      `${baseUrl}/rest/api/3/issue/${encodeURIComponent(idOrKey)}`,
      {
        headers: {
          Authorization: authHeader(config),
          Accept: "application/json",
        },
      },
    );
    const data = await readJson<JiraGetResponse>(res);
    const category = data.fields?.status?.statusCategory?.key;
    const statusName = data.fields?.status?.name;
    let status = mapGenericStatus(statusName);
    if (category === "done") status = "done";
    else if (category === "indeterminate") status = "in_progress";
    else if (category === "new") status = "open";

    return {
      provider: "jira",
      id: data.id,
      key: data.key,
      url: browseUrl(baseUrl, data.key),
      title: data.fields?.summary ?? data.key,
      status,
    };
  }

  return {
    id: "jira",
    async createIssue(input: CreateIssueInput): Promise<RemoteIssue> {
      const projectKey = input.projectKey ?? config.defaultProjectKey;
      if (!projectKey) {
        throw new Error("Jira create requires projectKey");
      }
      const res = await providerFetch(config, `${baseUrl}/rest/api/3/issue`, {
        method: "POST",
        headers: {
          Authorization: authHeader(config),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: input.title,
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: input.description }],
                },
              ],
            },
            issuetype: { name: "Bug" },
            labels: input.labels ?? [],
          },
        }),
      });
      const created = await readJson<JiraCreateResponse>(res);
      return {
        provider: "jira",
        id: created.id,
        key: created.key,
        url: browseUrl(baseUrl, created.key),
        title: input.title,
        status: "open",
      };
    },
    getIssue,
    linkExisting: getIssue,
  };
}
