import { providerFetch, readJson } from "./http";
import {
  mapGenericStatus,
  type CreateIssueInput,
  type IssueProvider,
  type IssueProviderConfig,
  type RemoteIssue,
} from "./types";

type LinearIssueNode = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state?: { name?: string; type?: string };
};

type LinearGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

async function linearGraphql<T>(
  config: IssueProviderConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  if (!config.token) throw new Error("Linear provider requires token");
  const baseUrl = (config.baseUrl ?? "https://api.linear.app").replace(/\/$/, "");
  const res = await providerFetch(config, `${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      Authorization: config.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await readJson<LinearGraphqlResponse<T>>(res);
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Linear returned empty data");
  return json.data;
}

function mapLinearState(state?: { name?: string; type?: string }) {
  if (state?.type === "completed" || state?.type === "canceled") return "done" as const;
  if (state?.type === "started") return "in_progress" as const;
  if (state?.type === "unstarted" || state?.type === "backlog") return "open" as const;
  return mapGenericStatus(state?.name);
}

export function createLinearProvider(config: IssueProviderConfig): IssueProvider {
  async function getIssue(idOrKey: string): Promise<RemoteIssue> {
    const data = await linearGraphql<{ issue: LinearIssueNode | null }>(
      config,
      `query ($id: String!) {
        issue(id: $id) {
          id identifier title url
          state { name type }
        }
      }`,
      { id: idOrKey },
    );
    if (!data.issue) {
      // Fall back to searching by identifier
      const search = await linearGraphql<{
        issues: { nodes: LinearIssueNode[] };
      }>(
        config,
        `query ($q: String!) {
          issues(filter: { identifier: { eq: $q } }, first: 1) {
            nodes { id identifier title url state { name type } }
          }
        }`,
        { q: idOrKey },
      );
      const node = search.issues.nodes[0];
      if (!node) throw new Error(`Linear issue not found: ${idOrKey}`);
      return {
        provider: "linear",
        id: node.id,
        key: node.identifier,
        url: node.url,
        title: node.title,
        status: mapLinearState(node.state),
      };
    }
    return {
      provider: "linear",
      id: data.issue.id,
      key: data.issue.identifier,
      url: data.issue.url,
      title: data.issue.title,
      status: mapLinearState(data.issue.state),
    };
  }

  return {
    id: "linear",
    async createIssue(input: CreateIssueInput): Promise<RemoteIssue> {
      const teamId = input.teamId ?? config.defaultTeamId;
      if (!teamId) throw new Error("Linear create requires teamId");
      const data = await linearGraphql<{
        issueCreate: { success: boolean; issue: LinearIssueNode };
      }>(
        config,
        `mutation ($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title url state { name type } }
          }
        }`,
        {
          input: {
            teamId,
            title: input.title,
            description: input.description,
            labelIds: undefined,
          },
        },
      );
      if (!data.issueCreate.success) {
        throw new Error("Linear issueCreate failed");
      }
      const issue = data.issueCreate.issue;
      return {
        provider: "linear",
        id: issue.id,
        key: issue.identifier,
        url: issue.url,
        title: issue.title,
        status: mapLinearState(issue.state),
      };
    },
    getIssue,
    linkExisting: getIssue,
  };
}
