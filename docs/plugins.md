# Topology plugin extension points

Topology is extended through small packages and HTTP contracts — not a hosted marketplace.

## Issue providers (`@topology/issue-providers`)

Implement `IssueProvider` (`createIssue`, `getIssue`, `linkExisting`, `updateIssue`, `transition`) and register via `resolveIssueProvider()` (env `TOPOLOGY_ISSUE_PROVIDER` or explicit `provider` option).

Built-ins: `mock`, `jira`, `linear`, `github`, `gitlab`.

Hub persistence (`linked_issues.provider`) currently stores `mock` | `jira` | `linear` | `github`. GitLab create/get/update works at the package layer; storing GitLab-linked issues in the hub needs a schema enum follow-up.

Use this when linking failures or triage items to an external tracker. Outbound sync calls `transition(..., { status: "done" })` when:

- a linked issue is marked closed in Topology (`markIssueClosedLocally`)
- a later result for that case **passes** (`syncIssuesOnPassingRetest`)

If the remote call fails, Topology still applies the local close so the retest queue can surface.

### Custom issue providers

`registerIssueProvider(id, factory)` writes through `@topology/plugin-sdk`. `resolveIssueProvider({ provider: id })` loads that factory for unknown IDs (built-ins still win).

```ts
import { registerIssueProvider, resolveIssueProvider } from "@topology/issue-providers";

registerIssueProvider("acme", () => ({
  id: "acme",
  createIssue: async (input) => { /* ... */ },
  getIssue: async (idOrKey) => { /* ... */ },
  linkExisting: async (idOrKey) => { /* ... */ },
  updateIssue: async (idOrKey, input) => { /* ... */ },
  transition: async (idOrKey, input) => { /* ... */ },
}));

const provider = resolveIssueProvider({ provider: "acme" });
```

Register in the Topology server process before the first `resolveIssueProvider` call. There is no filesystem plugin loader.

## Plugin SDK (`@topology/plugin-sdk`)

In-process registry for `registerPlugin()` with a `PluginKind`:

- `ci` — CI upload / run lifecycle
- `scm` — repository and pull-request sync
- `issue` — issue trackers (`registerIssueProvider` uses this)
- `ai` — proposal / agent actors
- `reporter` — test reporters (Playwright, JUnit, custom)

```ts
import { registerPlugin } from "@topology/plugin-sdk";

registerPlugin({
  id: "acme-reporter",
  kind: "reporter",
  label: "Acme JSON reporter",
  create: (config) => ({ upload: async () => config }),
});
```

## JSON execution protocol

POST `/api/executions` with a bearer API token and optional `x-topology-project-id`.

See `fixtures/execution/sample-report.json` for the report shape (`version`, `run`, `results[]` with `intentKey` / `implementationId` / `externalKey`, statuses, artifacts).

## Reporters

Thin wrappers over the same JSON protocol (validate + POST `/api/executions`):

| Package | Install | Hook |
| --- | --- | --- |
| `@topology/playwright` | `npm i -D @topology/playwright` | Playwright `reporter` |
| `@topology/jest` | `npm i -D @topology/jest` | Jest `reporters` |
| `@topology/cypress` | `npm i -D @topology/cypress` | Cypress `setupNodeEvents` → `topologyCypressPlugin` |
| `pytest-topology` | `pip install pytest-topology` | pytest plugin (auto-loaded) |

Shared env: `TOPOLOGY_URL` (default `http://127.0.0.1:4317`), `TOPOLOGY_API_TOKEN`, `TOPOLOGY_DRY_RUN=1` to skip upload.

CLI equivalent: `topology run upload report.json`.

## Outbound webhooks

Workspace admins configure endpoints for `run.completed`, `issue.created`, `intent.stale`, `coverage.dropped`, and `proposal.created`. Payloads are signed with `X-Topology-Signature` when a secret is set.

## GitHub / GitLab CI examples

- `packages/cli/examples/github-actions.yml` — sharded JUnit via Topology CLI
- `packages/cli/examples/gitlab-ci.yml` — GitLab CI: CLI JUnit upload **or** JSON protocol via `curl` / a reporter
- `packages/cli/examples/Jenkinsfile` — Jenkins JUnit via CLI
