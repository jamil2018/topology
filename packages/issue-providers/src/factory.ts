import { registerPlugin } from "@topology/plugin-sdk";
import { createGithubIssuesProvider } from "./github";
import { createJiraProvider } from "./jira";
import { createLinearProvider } from "./linear";
import { createMockIssueProvider } from "./mock";
import type {
  IssueProvider,
  IssueProviderConfig,
  IssueProviderId,
} from "./types";

export type ResolvedProviderOptions = IssueProviderConfig & {
  provider?: IssueProviderId | string;
};

export function resolveIssueProvider(
  options: ResolvedProviderOptions = {},
): IssueProvider {
  const fromEnv = (process.env.TOPOLOGY_ISSUE_PROVIDER ?? "mock").toLowerCase();
  const id = (options.provider ?? fromEnv) as IssueProviderId;

  const config: IssueProviderConfig = {
    fetch: options.fetch,
    baseUrl:
      options.baseUrl ??
      process.env.TOPOLOGY_ISSUE_BASE_URL ??
      process.env.JIRA_BASE_URL ??
      process.env.LINEAR_API_URL ??
      process.env.GITHUB_API_URL,
    token:
      options.token ??
      process.env.TOPOLOGY_ISSUE_TOKEN ??
      process.env.JIRA_API_TOKEN ??
      process.env.LINEAR_API_KEY ??
      process.env.GITHUB_TOKEN,
    email: options.email ?? process.env.JIRA_EMAIL,
    defaultProjectKey:
      options.defaultProjectKey ?? process.env.JIRA_PROJECT_KEY,
    defaultTeamId: options.defaultTeamId ?? process.env.LINEAR_TEAM_ID,
    defaultRepo:
      options.defaultRepo ?? process.env.GITHUB_REPO ?? process.env.TOPOLOGY_GITHUB_REPO,
  };

  switch (id) {
    case "jira":
      return createJiraProvider(config);
    case "linear":
      return createLinearProvider(config);
    case "github":
      return createGithubIssuesProvider(config);
    case "mock":
    default:
      return createMockIssueProvider(config);
  }
}

export function listIssueProviders(): IssueProviderId[] {
  return ["mock", "jira", "linear", "github"];
}

/** Register a custom issue provider plugin (same pattern as @topology/plugin-sdk). */
export function registerIssueProvider(
  id: IssueProviderId | string,
  factory: (config: IssueProviderConfig) => IssueProvider,
) {
  return registerPlugin({
    id,
    kind: "issue",
    label: String(id),
    create: (config: IssueProviderConfig) => factory(config),
  });
}
