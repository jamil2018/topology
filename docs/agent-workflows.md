# Agent workflows

## Project credentials

Settings → Integrations creates a project token with read and proposal capabilities. In Settings → Security, the QA agent preset issues read, run, and observation access. To grant another combination, use the project admin endpoint `POST /api/tokens` with a `scope` array.

| Capability | Operations |
| --- | --- |
| `agent-read` | List cases, runs, and results, read graph context and evidence, inspect workflow requests and release reports |
| `agent-propose` | Submit catalog and coverage changes for human review |
| `agent-run` | Create an assigned manual run or retest, or request an approved GitHub Actions workflow |
| `agent-observe` | Record one result or step, or hand off a manual run assigned to the credential owner |

Each credential is bound to one project and its owner. Expiring or revoking the credential, removing its owner from the project, or archiving the project closes scoped access. A project header, when supplied, must match the credential. Agent writes to the new API use an `Idempotency-Key`. Reuse the same key for a retry and a new key for a new operation. Successful effects, their attribution, and retry receipts are committed together.

### Legacy cutover

Migration `0010_agent_operations` enables temporary legacy writes for projects with active legacy `agent` credentials. Newly created projects default to scoped writes. Issue and verify replacement credentials, update clients, then turn off legacy writes as a project admin. Legacy `agent` credentials retain reads until they expire or are revoked.

```http
PATCH /api/projects
Content-Type: application/json

{"id":"PROJECT_UUID","legacyAgentWrites":false}
```

Use a signed-in project administrator session for this operation. The project audit log records the change.

## REST, CLI, and MCP

Use `GET /api/v1/agent?resource=cases` with `q`, `status`, `limit`, and the returned `nextCursor`. Use `resource=case&key=CASE-KEY` for structured content and recent versions. The `folders`, `shared_steps`, `custom_fields`, `plans`, and `run_templates` resources page the project catalog. The `results` resource pages by result ID and accepts `runId` and `status`. Read one result and its iteration and step snapshots at `resource=result&id=RESULT_UUID`.

Submit scoped mutations with `POST /api/v1/agent`. Supported actions are `propose_coverage`, `create_run`, `record_result`, `create_retest`, `handoff_run`, and `request_workflow`. A proposed new case uses a diff with `entityType: "case"`, `action: "create"`, `before: null`, and `after` containing its key, title, and optional structured steps. For case edits, read the case revision and submit an `update` diff with the case UUID as `entityId` and `before: { revision }`. A reviewed status change to `deprecated` archives the case, and `ready` restores it. Case and graph changes take effect when a human accepts them in Proposals. A scoped result uses `runId`, `resultId`, and optionally `stepResultId`.

```sh
topology agent list cases --q "Sign in" --status ready
topology agent apply operation.json --idempotency-key qa-session-42-run-1
topology affected --pr 42 --repository-id REPOSITORY_UUID
topology release evidence --pull-request-id PULL_REQUEST_UUID
```

MCP exposes `list_cases`, `propose_coverage`, `create_assigned_run`, `get_result`, `record_observation`, `create_retest`, `handoff_run`, `get_affected_tests`, `request_pr_workflow`, `get_workflow_request`, and `get_pr_release_evidence`. For scoped proposals, always pass `idempotencyKey`.

## GitHub Actions

Server operators configure eligible repositories, workflow refs, execution environments, and the ID of a dedicated project `ci-write` token.

```dotenv
TOPOLOGY_GITHUB_RUNNER_TARGETS='[{"repositoryId":"REPOSITORY_UUID","workflow":"verify.yml","ref":"main","environments":["smoke"],"reporterTokenId":"CI_TOKEN_UUID"}]'
TOPOLOGY_GITHUB_RELEASE_POLICIES='[{"repositoryId":"REPOSITORY_UUID","version":"1","workflow":"verify.yml","environments":["smoke"],"caseKeys":["AUTH-001"]}]'
```

Set `TOPOLOGY_GITHUB_RUNNER_TOKEN` to a repository-scoped credential with Actions write and pull request read access. Use an approved workflow definition on a protected ref. The GitHub API takes a branch or tag for the workflow and returns a provider run ID. Topology sends the commit under test as a separate input. [GitHub workflow dispatch documentation](https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10#create-a-workflow-dispatch-event)

1. Ingest the PR with its head SHA and changed paths through signed GitHub webhooks or `POST /api/git/ingest`. The affected-tests response includes the PR UUID, head SHA, and ready cases.
2. Request the configured workflow and environment with the PR UUID, its SHA, the selected case UUIDs, and a retry key. GitHub dispatch verifies the current open, ready PR head and repository before submitting. A request with an uncertain dispatch remains unconfirmed and the same key cannot dispatch it again.
3. Define `topology_request_id`, `topology_commit_sha`, and `topology_environment` as `workflow_dispatch` inputs. Use the environment names as Playwright project names in the [workflow example](../packages/cli/examples/topology-pr-verification.yml) to check out and verify the exact input SHA. Run PR code in a job without reporting credentials, then pass only its result data to the trusted upload job. Configure reporters or the upload job with `TOPOLOGY_RUNNER_REQUEST_ID`, `TOPOLOGY_COMMIT_SHA`, and `TOPOLOGY_RUNNER_CONFIGURATION`. The reporter uses GitHub's run ID and attempt. Give test cases stable implementation IDs or reviewed external keys.
4. Upload the report through `/api/executions` with the dedicated credential. The first workflow attempt is supported. Topology binds the report to the confirmed provider run, commit, configuration, request, and selected revisions. A matching replay returns the original run. Ambiguous or unmapped results stay visible without satisfying the release matrix.
5. In Impact, select the PR and open **View release evidence**. A human with release edit permission can sign off after every required cell passes. The sign-off binds the exact matrix, policy, and commit. A new head or changed case revision needs fresh evidence. Keep repository branch protection and deployment approval configured separately.

Runner requests and release evidence are available by API and MCP. Production qualification requires a configured sandbox repository and a live run with the actual reporting token and workflow.
