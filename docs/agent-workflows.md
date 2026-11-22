# Agent workflows

## Project credentials

Settings → Integrations creates a project token with read and proposal capabilities. In Settings → Security, the QA agent preset issues read, run, and observation access. To grant another combination, use the project admin endpoint `POST /api/tokens` with a `scope` array.

| Capability | Operations |
| --- | --- |
| `agent-read` | List cases, runs, and results, read graph context and evidence, inspect workflow requests and release reports |
| `agent-propose` | Submit catalog and coverage changes for human review |
| `agent-run` | Create an assigned manual run, exploratory session, or retest, launch a matrix plan or baseline, or request an approved GitHub Actions workflow or GitLab pipeline |
| `agent-observe` | Record one result or step with optional evidence, or hand off a manual run assigned to the credential owner |

Each credential is bound to one project and its owner. Expiring or revoking the credential, removing its owner from the project, or archiving the project closes scoped access. A project header, when supplied, must match the credential. Agent writes to the new API use an `Idempotency-Key`. Reuse the same key for a retry and a new key for a new operation. Successful effects, their attribution, and retry receipts are committed together.

### Legacy cutover

Migration `0010_agent_operations` enables temporary legacy writes for projects with active legacy `agent` credentials. Newly created projects default to scoped writes. Issue and verify replacement credentials, update clients, then turn off legacy writes as a project admin. Legacy `agent` credentials retain reads until they expire or are revoked.

```http
PATCH /api/projects
Content-Type: application/json

{"id":"PROJECT_UUID","legacyAgentWrites":false}
```

Use a signed-in project administrator session for this operation. The project audit log records the change.

## Required case review

Project admins can enable **Require case review** in Settings → Projects. Existing ready cases remain executable. New cases enter the catalog as drafts before they can be marked ready. The assigned reviewer approves a submitted draft using the revision returned by the case API. Vendor, CSV, and CI imports create drafts when they would otherwise create ready cases. CI can still record results and evidence.

Edits and archival requests for a ready case go to Proposals. The editor submits the revision it loaded and returns a link to the review queue. Acceptance requires both proposal review and case approval permissions. The ready revision remains available for runs while the proposal is pending. New manual runs, matrix launches, and retests select ready cases. Saved baselines retain their pinned revisions.

Bulk changes and version restores that would affect a ready or pending review case must go through the case editor. To change a shared step used by a ready or pending review case, create a replacement step and propose switching the references. Legacy agent credentials use a scoped case proposal to create a ready case in these projects. Apply migration `0014_case_review_policy` during upgrades.

## REST, CLI, and MCP

Use `GET /api/v1/agent?resource=cases` with `q`, `status`, `limit`, and the returned `nextCursor`. Use `resource=case&key=CASE-KEY` for structured content and recent versions. The `folders`, `shared_steps`, `custom_fields`, `plans`, and `run_templates` resources page the project catalog. The `results` resource pages by result ID and accepts `runId` and `status`. Read one result and its iteration and step snapshots at `resource=result&id=RESULT_UUID`.

Submit scoped mutations with `POST /api/v1/agent`. Supported actions are `propose_coverage`, `create_run`, `record_result`, `create_retest`, `handoff_run`, and `request_workflow`. A proposed new case uses a diff with `entityType: "case"`, `action: "create"`, `before: null`, and `after` containing its key, title, and optional structured steps. For case edits, read the case revision and submit an `update` diff with the case UUID as `entityId` and `before: { revision }`. A reviewed status change to `deprecated` archives the case, and `ready` restores it. Case and graph changes take effect when a human accepts them in Proposals. A scoped result uses `runId`, `resultId`, and optionally `stepResultId`.

```sh
topology agent list cases --q "Sign in" --status ready
topology agent apply operation.json --idempotency-key qa-session-42-run-1
topology agent apply observation.json --idempotency-key qa-session-42-observation-1 --evidence checks.log
topology affected --pr 42 --repository-id REPOSITORY_UUID
topology release evidence --pull-request-id PULL_REQUEST_UUID
```

MCP exposes `list_cases`, `propose_coverage`, `create_assigned_run`, `get_result`, `record_observation`, `create_retest`, `handoff_run`, `get_affected_tests`, `request_pr_workflow`, `get_workflow_request`, and `get_pr_release_evidence`. For scoped proposals, always pass `idempotencyKey`.

Use `assignee=me` when listing runs or results to find assigned work. A result assignee takes precedence over the run assignee. The plans catalog and `GET /api/v1/agent?resource=plan&id=PLAN_UUID` expose the planned cases and matrix. Pass `{"action":"launch_plan","planId":"PLAN_UUID"}` with an idempotency key, or use MCP `get_plan` and `launch_assigned_plan`. A project member must activate the plan first. Every selected case must be ready and all matrix environments must still be available. Topology assigns the resulting manual runs to the credential owner and commits the entire matrix together.

To propose a plan or run template, use `propose_coverage` with an `entityType` of `plan` or `run_template`. A new plan is a draft. To edit it, send an `update` diff with its `entityId`, the current `before: { revision }` from `get_plan`, and the fields to change in `after`. Read a template with `resource=run_template&id=TEMPLATE_UUID` or `get_run_template`. A template proposal supplies the complete template fields in `after`, including its ordered case IDs. The `environments` catalog lists valid project environment IDs for a plan matrix. A human must have the corresponding plan or template permission to accept the change. Stale revisions and unavailable references prevent the whole proposal from applying.

### Regression baselines

A project member with run creation permission can save a baseline from a plan's saved matrix and ready cases. Capture stores each case revision, expanded shared steps, resolved dataset iterations, and configuration. Launching the baseline always uses that copy, including after a case is edited, archived, or removed. Results retain their pinned case title and revision.

Agents can browse `resource=baselines`, inspect `resource=baseline&id=BASELINE_UUID`, and launch with `{"action":"launch_baseline","baselineId":"BASELINE_UUID"}` and an idempotency key. The corresponding MCP tools are `get_baseline` and `launch_assigned_baseline`. Apply migration `0013_regression_baselines` during an upgrade.

REST `record_result` and MCP `record_observation` accept one optional `evidence` object with `filename`, `dataBase64`, and optional `contentType`. The file must contain 1 byte to 1 MiB. The result stores the attachment and the audit entry links it to the exact result or step observation. The executor shows it with other result attachments. A project-bound `agent-read` token can download it at the returned URL. Retry a storage failure with the same key and evidence.

### Exploratory sessions

From Test runs → Start a run → Exploratory session, enter a charter and an environment. Topology assigns the session to its creator and creates a findings result for notes, evidence, and triage. Use **Propose a follow-up case** to submit a regression case with a link to the source session. For failed or blocked findings, a project member can preview and file a defect using the result's issue controls. An agent can record the finding and hand the session back for that decision.

Agents create a session with `{"action":"create_exploratory_session","name":"Explore checkout","charter":"Check recovery after a disconnect","environment":"smoke"}` or MCP `create_exploratory_session`. Save the returned run and result IDs for `record_result`. List these sessions with `resource=runs&source=exploratory` or `topology agent list runs --source exploratory --assignee me`. Read the saved charter with `resource=exploratory_session&id=RUN_UUID` or MCP `get_exploratory_session`. To propose a new case, add `exploration: { runId, resultId }` to `propose_coverage` and use the standard scoped idempotency key. The proposal and its audit entry retain the session and result references.

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
4. The trusted report job publishes a `topology-evidence` artifact. Set the repository variable `TOPOLOGY_URL` and the secret `TOPOLOGY_REPORT_TOKEN` for automatic HTTPS delivery. For a private Topology instance, leave the variable unset, download `topology-evidence.json` from the confirmed provider run, and upload it with `topology run upload topology-evidence.json` using the dedicated credential. The first workflow attempt is supported. Topology binds the report to the confirmed provider run, commit, configuration, request, and selected revisions. A matching replay returns the original run. Ambiguous or unmapped results stay visible without satisfying the release matrix.
5. In Impact, select the PR and open **View release evidence**. A human with release edit permission can sign off after every required cell passes. The sign-off binds the exact matrix, policy, and commit. A new head or changed case revision needs fresh evidence. Keep repository branch protection and deployment approval configured separately.

Runner requests and release evidence are available by API and MCP.

## GitLab CI

Configure a GitLab.com repository, an approved pipeline ref, and a dedicated project `ci-write` reporter credential. Use a project access token with API scope for dispatch and merge-request reads.

```dotenv
TOPOLOGY_GITLAB_RUNNER_TARGETS='[{"repositoryId":"REPOSITORY_UUID","workflow":"playwright","ref":"main","environments":["smoke"],"reporterTokenId":"CI_TOKEN_UUID"}]'
TOPOLOGY_GITLAB_RELEASE_POLICIES='[{"repositoryId":"REPOSITORY_UUID","version":"1","workflow":"playwright","environments":["smoke"],"caseKeys":["AUTH-001"]}]'
```

Set `TOPOLOGY_GITLAB_RUNNER_TOKEN` in the Topology process. Ingest the merge request and its exact head through the GitLab webhook or Git ingest. Submit `request_workflow` with the same fields as GitHub. Topology checks the open, non-draft, same-project merge request against GitLab and creates the pipeline on the approved ref. The test job checks out the separately supplied head SHA. Use GitLab 18.1 or newer for pipeline inputs. [Pipeline API](https://docs.gitlab.com/api/pipelines/#create-a-new-pipeline)

The [GitLab example pipeline](../packages/cli/examples/topology-gitlab-verification.yml) runs Playwright and publishes `topology-evidence.json` from a separate report job. For automatic delivery, scope the protected `TOPOLOGY_REPORT_TOKEN` CI variable to the `topology-evidence` environment and set `TOPOLOGY_URL` there. For pull delivery, download the evidence from the confirmed pipeline and use `topology run upload` with the reporter credential. Submit evidence from the original pipeline job. A different report for that request requires a new, explicitly approved request. [GitLab CI variable scopes](https://docs.gitlab.com/ci/variables/#limit-the-environment-scope-of-a-cicd-variable)
