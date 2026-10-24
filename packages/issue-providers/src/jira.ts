import { assertOk, providerFetch, readJson } from "./http";
import {
  mapGenericStatus,
  type CreateIssueInput,
  type IssueProvider,
  type IssueProviderConfig,
  type RemoteIssue,
  type RemoteIssueStatus,
  type TransitionIssueInput,
  type UpdateIssueInput,
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

type JiraTransitionsResponse = {
  transitions?: Array<{
    id: string;
    name: string;
    to?: { name?: string; statusCategory?: { key?: string } };
  }>;
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

function mapJiraStatus(data: JiraGetResponse): RemoteIssueStatus {
  const category = data.fields?.status?.statusCategory?.key;
  const statusName = data.fields?.status?.name;
  let status = mapGenericStatus(statusName);
  if (category === "done") status = "done";
  else if (category === "indeterminate") status = "in_progress";
  else if (category === "new") status = "open";
  return status;
}

function toRemote(baseUrl: string, data: JiraGetResponse, fallbackTitle?: string): RemoteIssue {
  return {
    provider: "jira",
    id: data.id,
    key: data.key,
    url: browseUrl(baseUrl, data.key),
    title: data.fields?.summary ?? fallbackTitle ?? data.key,
    status: mapJiraStatus(data),
  };
}

function wantedCategory(status: RemoteIssueStatus): string | undefined {
  if (status === "done") return "done";
  if (status === "in_progress") return "indeterminate";
  if (status === "open") return "new";
  return undefined;
}

export function pickJiraTransitionId(
  transitions: NonNullable<JiraTransitionsResponse["transitions"]>,
  target: RemoteIssueStatus,
): string | undefined {
  const category = wantedCategory(target);
  const byCategory = transitions.find((t) => t.to?.statusCategory?.key === category);
  if (byCategory) return byCategory.id;
  return transitions.find(
    (t) =>
      mapGenericStatus(t.to?.name) === target || mapGenericStatus(t.name) === target,
  )?.id;
}

export function createJiraProvider(config: IssueProviderConfig): IssueProvider {
  const baseUrl = (config.baseUrl ?? "").replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Jira provider requires baseUrl (e.g. https://org.atlassian.net)");
  }

  function headers(json = false): HeadersInit {
    return {
      Authorization: authHeader(config),
      Accept: "application/json",
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  async function getIssue(idOrKey: string): Promise<RemoteIssue> {
    const res = await providerFetch(
      config,
      `${baseUrl}/rest/api/3/issue/${encodeURIComponent(idOrKey)}`,
      { headers: headers() },
    );
    const data = await readJson<JiraGetResponse>(res);
    return toRemote(baseUrl, data);
  }

  async function transition(
    idOrKey: string,
    input: TransitionIssueInput,
  ): Promise<RemoteIssue> {
    const list = await providerFetch(
      config,
      `${baseUrl}/rest/api/3/issue/${encodeURIComponent(idOrKey)}/transitions`,
      { headers: headers() },
    );
    const data = await readJson<JiraTransitionsResponse>(list);
    const transitionId = pickJiraTransitionId(data.transitions ?? [], input.status);
    if (!transitionId) {
      throw new Error(`Jira has no transition to ${input.status} for ${idOrKey}`);
    }
    const posted = await providerFetch(
      config,
      `${baseUrl}/rest/api/3/issue/${encodeURIComponent(idOrKey)}/transitions`,
      {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ transition: { id: transitionId } }),
      },
    );
    await assertOk(posted);
    return getIssue(idOrKey);
  }

  async function updateIssue(
    idOrKey: string,
    input: UpdateIssueInput,
  ): Promise<RemoteIssue> {
    const fields: Record<string, unknown> = {};
    if (input.title) fields.summary = input.title;
    if (input.description) {
      fields.description = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: input.description }],
          },
        ],
      };
    }
    if (Object.keys(fields).length > 0) {
      const res = await providerFetch(
        config,
        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(idOrKey)}`,
        {
          method: "PUT",
          headers: headers(true),
          body: JSON.stringify({ fields }),
        },
      );
      await assertOk(res);
    }
    if (input.status) {
      return transition(idOrKey, { status: input.status });
    }
    return getIssue(idOrKey);
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
        headers: headers(true),
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
    updateIssue,
    transition,
  };
}
