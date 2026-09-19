# Topology plugin extension points

Topology is extended through small packages and HTTP contracts — not a hosted marketplace.

## Issue providers (`@topology/issue-providers`)

Implement `IssueProvider` and register via `resolveIssueProvider()` (env `TOPOLOGY_ISSUE_PROVIDER` or explicit `provider` option). Built-ins: `mock`, `jira`, `linear`, `github`.

Use this when linking failures or triage items to an external tracker.

## Plugin SDK (`@topology/plugin-sdk`)

For new integration kinds, use `registerPlugin()` with a `PluginKind`:

- `ci` — CI upload / run lifecycle
- `scm` — repository and pull-request sync
- `issue` — issue trackers (wraps issue-providers pattern)
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

## JSON execution protocol (Phase 2)

POST `/api/executions` with a bearer API token and optional `x-topology-project-id`.

See `fixtures/execution/sample-report.json` for the report shape (`version`, `run`, `results[]` with `intentKey` / `implementationId`, statuses, artifacts).

## Playwright reporter

Package `@topology/playwright` publishes results using the same ingestion path as CI JSON uploads.

## Outbound webhooks

Workspace admins configure endpoints for `run.completed`, `issue.created`, `intent.stale`, `coverage.dropped`, and `proposal.created`. Payloads are signed with `X-Topology-Signature` when a secret is set.

## GitHub / GitLab CI examples

- `packages/cli/examples/github-actions.yml` — sharded JUnit via Topology CLI
- `packages/cli/examples/gitlab-ci.yml` — JSON protocol via `curl` to `/api/executions`
