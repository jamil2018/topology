import { providerFetch, readJson } from "./http";
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

type LinearIssueNode = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state?: { name?: string; type?: string };
};

type LinearStateNode = { id: string; name: string; type?: string };

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

function toRemote(node: LinearIssueNode): RemoteIssue {
  return {
    provider: "linear",
    id: node.id,
    key: node.identifier,
    url: node.url,
    title: node.title,
    status: mapLinearState(node.state),
  };
}

export function pickLinearStateId(
  states: LinearStateNode[],
  target: RemoteIssueStatus,
): string | undefined {
  const typeFor: Record<RemoteIssueStatus, string[]> = {
    done: ["completed"],
    in_progress: ["started"],
    open: ["unstarted", "backlog"],
    unknown: [],
  };
  const wanted = typeFor[target] ?? [];
  const match = states.find((s) => s.type && wanted.includes(s.type));
  if (match) return match.id;
  return states.find((s) => mapGenericStatus(s.name) === target)?.id;
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
      return toRemote(node);
    }
    return toRemote(data.issue);
  }

  async function transition(
    idOrKey: string,
    input: TransitionIssueInput,
  ): Promise<RemoteIssue> {
    const current = await getIssue(idOrKey);
    const data = await linearGraphql<{
      issue: {
        id: string;
        team?: { states?: { nodes: LinearStateNode[] } };
      } | null;
    }>(
      config,
      `query ($id: String!) {
        issue(id: $id) {
          id
          team { states { nodes { id name type } } }
        }
      }`,
      { id: current.id },
    );
    const states = data.issue?.team?.states?.nodes ?? [];
    const stateId = pickLinearStateId(states, input.status);
    if (!stateId) {
      throw new Error(`Linear has no state for ${input.status} on ${idOrKey}`);
    }
    const updated = await linearGraphql<{
      issueUpdate: { success: boolean; issue: LinearIssueNode };
    }>(
      config,
      `mutation ($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue { id identifier title url state { name type } }
        }
      }`,
      { id: current.id, input: { stateId } },
    );
    if (!updated.issueUpdate.success) {
      throw new Error("Linear issueUpdate failed");
    }
    return toRemote(updated.issueUpdate.issue);
  }

  async function updateIssue(
    idOrKey: string,
    input: UpdateIssueInput,
  ): Promise<RemoteIssue> {
    const current = await getIssue(idOrKey);
    const patch: Record<string, unknown> = {};
    if (input.title) patch.title = input.title;
    if (input.description) patch.description = input.description;
    if (Object.keys(patch).length > 0) {
      const updated = await linearGraphql<{
        issueUpdate: { success: boolean; issue: LinearIssueNode };
      }>(
        config,
        `mutation ($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier title url state { name type } }
          }
        }`,
        { id: current.id, input: patch },
      );
      if (!updated.issueUpdate.success) {
        throw new Error("Linear issueUpdate failed");
      }
    }
    if (input.status) {
      return transition(idOrKey, { status: input.status });
    }
    return getIssue(current.id);
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
      return toRemote(data.issueCreate.issue);
    },
    getIssue,
    linkExisting: getIssue,
    updateIssue,
    transition,
  };
}
