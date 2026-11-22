import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, auditEvents, cases, testImplementations, caseSteps, notifications, proposals, retestSources, runResults, runStepResults, runs, testPlanCases, testPlans, users, workspaces } from "@/db/schema";
import { GET, POST } from "@/app/api/v1/agent/route";
import { POST as uploadExecution } from "@/app/api/executions/route";
import { ensurePullRequest, ensureRepository } from "@/lib/git-sync";
import { ensureIntentForCase } from "@/lib/quality-graph/ensure";
import { readPrReleaseEvidence, signPrReleaseEvidence } from "@/lib/pr-release-evidence";
import { generateApiToken } from "@/lib/ci-auth";
import { buildImportRows } from "@/lib/import";
import { persistImportedCases } from "@/lib/import/persist";
import { readCaseRevision } from "@/lib/case-revision";
import { createProposal, reviewProposal } from "@/lib/proposals";
import { ensureMembership } from "@/lib/workspace";
import { resetAttachmentStorageCache } from "@/lib/attachments";

const endpoint = "http://topology.test/api/v1/agent";

describe("Scoped agent operations", () => {
  let projectId: string;
  let ownerId: string;
  let readToken: string;
  let workToken: string;
  let readyCaseId: string;

  async function mint(scope: string) {
    const { token, hash, prefix } = generateApiToken();
    await db.insert(apiTokens).values({
      workspaceId: projectId, userId: ownerId, name: scope,
      tokenHash: hash, tokenPrefix: prefix, scope,
    });
    return token;
  }

  function request(token: string, query?: URLSearchParams) {
    return new Request(query ? `${endpoint}?${query}` : endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  function post(token: string, key: string, body: Record<string, unknown>) {
    return POST(new Request(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    }));
  }

  beforeAll(async () => {
    const owner = await db.query.users.findFirst({ where: eq(users.email, "demo@topology.local") });
    expect(owner).toBeTruthy();
    ownerId = owner!.id;
    const { workspace } = await ensureMembership(ownerId, "admin");
    projectId = workspace.id;
    readToken = await mint("agent-read");
    workToken = await mint("agent-read,agent-propose,agent-run,agent-observe");
    const [ready] = await db.insert(cases).values({
      workspaceId: projectId, key: "AGENT-READY", title: "Ready for observation", status: "ready",
    }).returning();
    readyCaseId = ready.id;
    await db.insert(caseSteps).values({ workspaceId: projectId, caseId: ready.id, position: 0, action: "Inspect the app", expected: "Visible" });
  });

  it("filters before paginating a 50,000-case catalog", async () => {
    await db.execute(sql`
      insert into ${cases} (workspace_id, key, title)
      select ${projectId}::uuid, 'AGENT-SCALE-' || lpad(i::text, 5, '0'),
        case when i > 49997 then 'Agent search sentinel' else 'Unrelated case' end
      from generate_series(1, 50000) i
    `);
    const params = new URLSearchParams({ resource: "cases", q: "Agent search sentinel", status: "draft", limit: "2" });
    const first = await GET(request(readToken, params));
    expect(first.status).toBe(200);
    const page = await first.json();
    expect(page.total).toBe(3);
    expect(page.cases.map(({ key }: { key: string }) => key)).toEqual(["AGENT-SCALE-49998", "AGENT-SCALE-49999"]);
    params.set("cursor", page.nextCursor);
    const next = await (await GET(request(readToken, params))).json();
    expect(next.cases.map(({ key }: { key: string }) => key)).toEqual(["AGENT-SCALE-50000"]);
    expect(next.nextCursor).toBeNull();
  });

  it("checks capabilities and replays the original run and observation without duplicating them", async () => {
    const input = { action: "create_run", name: "Agent verification", caseIds: [readyCaseId] };
    expect((await post(readToken, "run-1", input)).status).toBe(403);
    const [first, retry] = await Promise.all([post(workToken, "run-1", input), post(workToken, "run-1", input)]);
    expect([first.status, retry.status]).toEqual([201, 201]);
    const body = await first.json();
    expect(await retry.json()).toEqual(body);
    expect((await post(workToken, "run-1", { ...input, name: "Another run" })).status).toBe(409);

    const result = await db.query.runResults.findFirst({
      where: eq(runResults.runId, body.run.id), with: { stepResults: true },
    });
    expect(result?.stepResults).toHaveLength(1);
    const observation = {
      action: "record_result", runId: body.run.id, resultId: result!.id,
      stepResultId: result!.stepResults[0].id, status: "passed", notes: "Observed independently",
    };
    expect((await post(workToken, "observe-1", observation)).status).toBe(200);
    expect((await post(workToken, "observe-1", observation)).status).toBe(200);
    expect((await db.query.runStepResults.findFirst({
      where: eq(runStepResults.id, observation.stepResultId),
    }))?.status).toBe("passed");
    expect(await db.query.auditEvents.findMany({ where: and(
      eq(auditEvents.workspaceId, projectId),
      eq(auditEvents.targetId, observation.stepResultId),
    ) })).toHaveLength(1);

    const failed = await post(workToken, "result-failed", {
      action: "record_result", runId: body.run.id, resultId: result!.id,
      status: "failed", notes: "Expected behavior missing",
    });
    expect(failed.status).toBe(200);
    const retest = await post(workToken, "retest-1", {
      action: "create_retest", name: "Retest observed failure", sourceResultIds: [result!.id],
    });
    expect(retest.status).toBe(201);
    const retestBody = await retest.json();
    const lineage = await db.query.retestSources.findMany({ where: eq(retestSources.sourceResultId, result!.id) });
    expect(lineage).toHaveLength(1);
    const teammate = await db.query.users.findFirst({ where: eq(users.email, "member@topology.local") });
    expect(teammate).toBeTruthy();
    const handoff = {
      action: "handoff_run", runId: retestBody.run.id, assigneeId: teammate!.id, notes: "Please rerun after the fix",
    };
    expect((await post(workToken, "handoff-1", handoff)).status).toBe(200);
    expect((await post(workToken, "handoff-1", handoff)).status).toBe(200);
    expect(await db.query.notifications.findMany({
      where: and(eq(notifications.userId, teammate!.id), eq(notifications.entityId, retestBody.run.id)),
    })).toHaveLength(1);
    expect((await post(workToken, "post-handoff-result", {
      action: "record_result", runId: retestBody.run.id, resultId: lineage[0].resultId, status: "passed",
    })).status).toBe(403);
  });

  it("rolls back earlier edits if a later proposal diff fails", async () => {
    const key = "AGENT-ROLLBACK";
    const { id } = await createProposal({
      workspaceId: projectId,
      payload: { diffs: [
        { entityType: "case", action: "create", before: null, after: { key, title: "Rolled back" } },
        { entityType: "edge", action: "link", before: null, after: { relation: "covers" } },
      ] },
    });
    await expect(reviewProposal({ workspaceId: projectId, proposalId: id, decision: "accepted", approvedById: ownerId }))
      .rejects.toThrow("link requires");
    expect(await db.query.cases.findFirst({ where: and(eq(cases.workspaceId, projectId), eq(cases.key, key)) })).toBeUndefined();
    expect((await db.query.proposals.findFirst({ where: eq(proposals.id, id) }))?.status).toBe("pending");
  });

  it("launches an active matrix once and finds effective assignments before paging", async () => {
    const teammate = await db.query.users.findFirst({ where: eq(users.email, "member@topology.local") });
    const [plan] = await db.insert(testPlans).values({
      workspaceId: projectId, name: "Agent matrix",
      matrixJson: JSON.stringify({ browsers: ["Chromium", "Firefox"], operatingSystems: ["Linux"] }),
    }).returning();
    await db.insert(testPlanCases).values({ planId: plan.id, caseId: readyCaseId });
    const launch = { action: "launch_plan", planId: plan.id };
    expect((await post(workToken, "draft-matrix", launch)).status).toBe(409);
    await db.update(testPlans).set({ status: "active" }).where(eq(testPlans.id, plan.id));
    const preview = await GET(request(readToken, new URLSearchParams({ resource: "plan", id: plan.id })));
    expect(await preview.json()).toMatchObject({
      plan: { status: "active", matrix: { browsers: ["Chromium", "Firefox"] }, cases: [{ id: readyCaseId, status: "ready" }] },
      unavailableCases: 0,
    });
    const [first, replay] = await Promise.all([
      post(workToken, "launch-matrix", launch), post(workToken, "launch-matrix", launch),
    ]);
    expect([first.status, replay.status]).toEqual([201, 201]);
    const launched = await first.json();
    expect(await replay.json()).toEqual(launched);
    expect(launched.runs).toMatchObject([
      { assigneeId: ownerId, matrixBrowser: "Chromium", matrixOs: "Linux" },
      { assigneeId: ownerId, matrixBrowser: "Firefox", matrixOs: "Linux" },
    ]);
    const stored = await db.query.runs.findMany({ where: eq(runs.planId, plan.id), with: {
      results: { with: { stepResults: true } },
    } });
    expect(stored).toHaveLength(2);
    for (const run of stored) expect(run.results[0].stepResults).toHaveLength(1);

    const [inherited, override] = stored;
    await db.update(runResults).set({ assigneeId: teammate!.id }).where(eq(runResults.id, override.results[0].id));
    const assignedResult = (runId: string) => GET(request(readToken, new URLSearchParams({
      resource: "results", runId, assignee: "me", limit: "1",
    })));
    expect(await (await assignedResult(inherited.id)).json()).toMatchObject({ results: [{ id: inherited.results[0].id }] });
    expect(await (await assignedResult(override.id)).json()).toEqual({ results: [], nextCursor: null });

    await db.update(runs).set({ assigneeId: teammate!.id }).where(eq(runs.id, override.id));
    await db.update(runResults).set({ assigneeId: ownerId }).where(eq(runResults.id, override.results[0].id));
    expect(await (await assignedResult(override.id)).json()).toMatchObject({ results: [{ id: override.results[0].id }] });
    const assigned = await GET(request(readToken, new URLSearchParams({ resource: "runs", assignee: "me", status: "planned" })));
    expect((await assigned.json()).runs.map(({ id }: { id: string }) => id)).toEqual(expect.arrayContaining(stored.map(({ id }) => id)));
  });

  it("rolls back the observation when evidence storage fails and allows the same key to retry", async () => {
    const created = await post(workToken, "artifact-run", {
      action: "create_run", name: "Evidence storage retry", caseIds: [readyCaseId],
    });
    expect(created.status).toBe(201);
    const { run } = await created.json();
    const result = await db.query.runResults.findFirst({ where: eq(runResults.runId, run.id) });
    const input = {
      action: "record_result", runId: run.id, resultId: result!.id, status: "passed",
      evidence: { filename: "check.log", dataBase64: Buffer.from("Observed behavior").toString("base64") },
    };
    const root = await mkdtemp(join(tmpdir(), "topology-agent-evidence-"));
    try {
      const blocked = join(root, "not-a-directory");
      await writeFile(blocked, "");
      vi.stubEnv("ATTACHMENTS_DRIVER", "local");
      vi.stubEnv("ATTACHMENTS_DIR", blocked);
      resetAttachmentStorageCache();

      const failure = await post(workToken, "artifact-retry", input);
      expect(failure.status).toBe(503);
      expect(await failure.json()).toMatchObject({ code: "EVIDENCE_STORAGE_FAILED" });
      const unchanged = await db.query.runResults.findFirst({
        where: eq(runResults.id, result!.id), with: { attachments: true },
      });
      expect(unchanged).toMatchObject({ status: "untested", attachments: [] });

      vi.stubEnv("ATTACHMENTS_DIR", root);
      resetAttachmentStorageCache();
      const retry = await post(workToken, "artifact-retry", input);
      expect(retry.status).toBe(200);
      const applied = await db.query.runResults.findFirst({
        where: eq(runResults.id, result!.id), with: { attachments: true },
      });
      expect(applied).toMatchObject({
        status: "passed", attachments: [{ filename: "check.log", uploadedById: ownerId }],
      });
    } finally {
      vi.unstubAllEnvs();
      resetAttachmentStorageCache();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps the approved case executable until an exact-revision proposal is accepted", async () => {
    const snapshot = await readCaseRevision(projectId, readyCaseId);
    expect(snapshot?.definition.status).toBe("ready");
    const change = {
      workspaceId: projectId,
      payload: { diffs: [{
        entityType: "case" as const, action: "update" as const, entityId: readyCaseId,
        before: { revision: snapshot!.revision },
        after: { title: "Reviewed observation case" },
      }] },
    };
    const pending = await createProposal(change);
    const stale = await createProposal(change);
    expect((await readCaseRevision(projectId, readyCaseId))?.revision).toBe(snapshot!.revision);
    const requests = await Promise.all([
      reviewProposal({ workspaceId: projectId, proposalId: pending.id, decision: "accepted", approvedById: ownerId }),
      reviewProposal({ workspaceId: projectId, proposalId: pending.id, decision: "accepted", approvedById: ownerId }),
    ]);
    expect(requests.every(({ proposal }) => proposal.status === "accepted")).toBe(true);
    expect((await readCaseRevision(projectId, readyCaseId))?.definition.title).toBe("Reviewed observation case");
    await expect(reviewProposal({ workspaceId: projectId, proposalId: stale.id, decision: "accepted", approvedById: ownerId }))
      .rejects.toThrow("Case revision changed");
    expect(await db.query.caseVersions.findMany({ where: (table, { eq }) => eq(table.caseId, readyCaseId) })).toHaveLength(1);
  });

  it("preserves nested vendor folders and structured steps on a restartable import", async () => {
    const payload = JSON.stringify([{ key: "VENDOR-42", summary: "Vendor scenario",
      testRepositoryPath: "Migration parent / Child",
      steps: [{ action: "Enter card", data: "test value" }, { action: "Submit", result: "Accepted" }],
    }]);
    const { rows } = buildImportRows("xray", payload);
    expect(rows[0]?.structuredSteps).toHaveLength(2);
    const settings = { workspaceId: projectId, actorId: ownerId, provider: "xray" as const, sourceNamespace: "migration-fixture" };
    const dryRun = await persistImportedCases({ ...settings, rows, dryRun: true });
    expect(dryRun).toMatchObject({ wouldCreate: 1, created: [] });
    const applied = await persistImportedCases({ ...settings, rows, dryRun: false });
    expect(applied.created).toHaveLength(1);
    const leaf = await db.query.folders.findFirst({ where: (table, { eq }) => eq(table.id, applied.created[0].folderId!) });
    expect(leaf).toMatchObject({ name: "Child", parentId: expect.any(String) });
    const steps = await db.query.caseSteps.findMany({
      where: eq(caseSteps.caseId, applied.created[0].id), orderBy: (table, { asc }) => [asc(table.position)],
    });
    expect(steps).toMatchObject([{ action: "Enter card", data: "test value", expected: "" }, { action: "Submit", expected: "Accepted" }]);
    await db.update(cases).set({ key: "RENAMED-42" }).where(eq(cases.id, applied.created[0].id));
    expect((await persistImportedCases({ ...settings, rows, dryRun: false })).skipDetails)
      .toEqual([{ key: "VENDOR-42", reason: "existing_source" }]);
  });

  it("dispatches exactly once and signs only a complete, current PR matrix", async () => {
    const reporter = await mint("ci-write");
    const reporterRow = await db.query.apiTokens.findFirst({ where: and(
      eq(apiTokens.workspaceId, projectId), eq(apiTokens.tokenPrefix, reporter.slice(0, 12)),
    ) });
    const repo = await ensureRepository(projectId, { remoteUrl: "https://github.com/acme/topology-fixture.git" });
    const commitSha = "a".repeat(40);
    const pr = await ensurePullRequest(repo.id, { number: 42, headSha: commitSha, changedPaths: ["src/example.ts"] });
    const ready = await db.query.cases.findFirst({ where: eq(cases.id, readyCaseId) });
    const { intentId } = await ensureIntentForCase(ready!);
    const [implementation] = await db.insert(testImplementations).values({
      workspaceId: projectId, intentId, type: "playwright", externalKey: "agent-evidence",
    }).returning();

    vi.stubEnv("TOPOLOGY_GITHUB_RUNNER_TARGETS", JSON.stringify([{
      repositoryId: repo.id, workflow: "verify.yml", ref: "main",
      environments: ["smoke"], reporterTokenId: reporterRow!.id,
    }]));
    vi.stubEnv("TOPOLOGY_GITHUB_RUNNER_TOKEN", "fixture-github-token");
    const policy = { repositoryId: repo.id, version: "pilot-1", workflow: "verify.yml",
      environments: ["smoke", "full"], caseKeys: [ready!.key] };
    vi.stubEnv("TOPOLOGY_GITHUB_RELEASE_POLICIES", JSON.stringify([policy]));
    const realFetch = globalThis.fetch;
    const fake = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/pulls/42")) return Promise.resolve(Response.json({
        state: "open", draft: false, head: { sha: commitSha, repo: { full_name: "acme/topology-fixture" } },
      }));
      if (url.endsWith("/dispatches")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          ref: "main", inputs: { topology_commit_sha: commitSha, topology_environment: "smoke" },
        });
        return Promise.resolve(Response.json({ workflow_run_id: 1234 }));
      }
      return realFetch(input, init);
    });

    try {
      const operation = { action: "request_workflow", pullRequestId: pr.id, commitSha,
        environment: "smoke", workflow: "verify.yml", caseIds: [readyCaseId] };
      expect((await post(workToken, "wrong-head", { ...operation, commitSha: "b".repeat(40) })).status).toBe(409);
      const [first, retry] = await Promise.all([
        post(workToken, "provider-request-1", operation), post(workToken, "provider-request-1", operation),
      ]);
      expect([first.status, retry.status]).toEqual([202, 202]);
      const receipt = await first.json();
      expect(await retry.json()).toEqual(receipt);
      expect(fake.mock.calls.filter(([url]) => String(url).endsWith("/dispatches"))).toHaveLength(1);

      const report = {
        version: 1,
        run: { externalId: "1234", runnerRequestId: receipt.requestId, commitSha, configuration: "smoke", runnerAttempt: 1 },
        results: [{ implementationId: implementation.id, status: "passed", artifacts: [] }],
      };
      function upload(token: string, payload: typeof report) {
        return uploadExecution(new Request("http://topology.test/api/executions", {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }));
      }
      const unrelated = await mint("ci-write");
      expect((await upload(unrelated, report)).status).toBe(403);
      expect((await upload(reporter, { ...report, run: { ...report.run, configuration: "full" } })).status).toBe(409);
      const uploadResult = await upload(reporter, report);
      expect(uploadResult.status).toBe(200);
      const uploaded = await uploadResult.json();
      expect(uploaded.resultIds).toHaveLength(1);
      expect(await (await upload(reporter, report)).json()).toMatchObject({ ...uploaded, replayed: true });

      const incomplete = await readPrReleaseEvidence(projectId, pr.id);
      expect(incomplete).toMatchObject({ state: "evidence_incomplete",
        matrix: [{ status: "not_requested" }, { status: "passed", runId: uploaded.runId }],
      });
      await expect(signPrReleaseEvidence({ workspaceId: projectId, actorId: ownerId, pullRequestId: pr.id,
        digest: incomplete!.digest!,
      })).rejects.toThrow("Evidence must pass");

      vi.stubEnv("TOPOLOGY_GITHUB_RELEASE_POLICIES", JSON.stringify([{ ...policy, version: "pilot-2", environments: ["smoke"] }]));
      const eligible = await readPrReleaseEvidence(projectId, pr.id);
      expect(eligible?.state).toBe("awaiting_signoff");
      const signoff = await signPrReleaseEvidence({
        workspaceId: projectId, actorId: ownerId, pullRequestId: pr.id, digest: eligible!.digest!,
      });
      expect(signoff?.actorId).toBe(ownerId);
      expect((await readPrReleaseEvidence(projectId, pr.id))?.state).toBe("signed");

      await ensurePullRequest(repo.id, { number: 42, headSha: "b".repeat(40) });
      expect(await readPrReleaseEvidence(projectId, pr.id)).toMatchObject({
        state: "evidence_incomplete", matrix: [{ status: "stale_commit" }],
      });
    } finally {
      fake.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("dispatches an approved GitLab pipeline and uses its exact evidence for sign-off", async () => {
    const reporter = await mint("ci-write");
    const reporterRow = await db.query.apiTokens.findFirst({ where: and(
      eq(apiTokens.workspaceId, projectId), eq(apiTokens.tokenPrefix, reporter.slice(0, 12)),
    ) });
    const repo = await ensureRepository(projectId, {
      remoteUrl: "https://gitlab.com/acme/nightly/app.git", provider: "gitlab",
    });
    const commitSha = "c".repeat(40);
    const pr = await ensurePullRequest(repo.id, { number: 17, headSha: commitSha });
    const ready = await db.query.cases.findFirst({ where: eq(cases.id, readyCaseId) });
    const { intentId } = await ensureIntentForCase(ready!);
    const [implementation] = await db.insert(testImplementations).values({
      workspaceId: projectId, intentId, type: "playwright", externalKey: "gitlab-pinned-evidence",
    }).returning();
    vi.stubEnv("TOPOLOGY_GITLAB_RUNNER_TOKEN", "sandbox-gitlab-fixture-token");
    vi.stubEnv("TOPOLOGY_GITLAB_RUNNER_TARGETS", JSON.stringify([{
      repositoryId: repo.id, workflow: "playwright", ref: "qa/verification",
      environments: ["smoke"], reporterTokenId: reporterRow!.id,
    }]));
    vi.stubEnv("TOPOLOGY_GITLAB_RELEASE_POLICIES", JSON.stringify([{
      repositoryId: repo.id, version: "pilot-1", workflow: "playwright",
      environments: ["smoke"], caseKeys: [ready!.key],
    }]));
    const providerApi = "https://gitlab.com/api/v4/projects/acme%2Fnightly%2Fapp";
    let sourceProject = 101;
    let liveSha = commitSha;
    const dispatches: Record<string, string>[] = [];
    const originalFetch = globalThis.fetch;
    const fake = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (!url.startsWith(providerApi)) return originalFetch(input, init);
      expect(new Headers(init?.headers).get("PRIVATE-TOKEN")).toBe("sandbox-gitlab-fixture-token");
      if (url === `${providerApi}/merge_requests/17`) {
        return Promise.resolve(Response.json({
          state: "opened", draft: false, sha: liveSha,
          source_project_id: sourceProject, target_project_id: 100,
        }));
      }
      expect(url).toBe(`${providerApi}/pipeline?ref=qa%2Fverification`);
      expect(init?.method).toBe("POST");
      const { inputs } = JSON.parse(String(init?.body));
      dispatches.push(inputs);
      return Promise.resolve(Response.json({ id: 7654321 }, { status: 201 }));
    });
    const readRequest = async (id: string) => {
      const response = await GET(request(readToken, new URLSearchParams({ resource: "workflow_request", id })));
      expect(response.status).toBe(200);
      return (await response.json()).request;
    };
    try {
      const operation = { action: "request_workflow", pullRequestId: pr.id, commitSha,
        environment: "smoke", workflow: "playwright", caseIds: [readyCaseId] };
      expect((await post(workToken, "gitlab-disallowed", { ...operation, environment: "other" })).status).toBe(403);
      const forbidden = await post(workToken, "gitlab-fork", operation);
      expect(forbidden.status).toBe(202);
      expect((await readRequest((await forbidden.json()).requestId)).status).toBe("rejected");
      expect(dispatches).toHaveLength(0);

      sourceProject = 100;
      const accepted = await post(workToken, "gitlab-smoke", operation);
      expect(accepted.status).toBe(202);
      const receipt = await accepted.json();
      expect(await (await post(workToken, "gitlab-smoke", operation)).json()).toEqual(receipt);
      expect(dispatches).toEqual([{
        topology_request_id: receipt.requestId, topology_commit_sha: commitSha,
        topology_environment: "smoke", topology_workflow: "playwright",
      }]);
      expect(await readRequest(receipt.requestId)).toMatchObject({
        provider: "gitlab", status: "dispatched", providerRunId: "7654321",
        providerHref: "https://gitlab.com/acme/nightly/app/-/pipelines/7654321",
      });
      const run = { externalId: "7654321", runnerRequestId: receipt.requestId, commitSha, configuration: "smoke", runnerAttempt: 1 };
      const payload = { version: 1, run, results: [{ implementationId: implementation.id, status: "passed" }] };
      const upload = (body: typeof payload) => uploadExecution(new Request("http://topology.test/api/executions", {
        method: "POST",
        headers: { Authorization: `Bearer ${reporter}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }));
      expect((await upload({ ...payload, run: { ...run, externalId: "7654322" } })).status).toBe(409);
      const reported = await upload(payload);
      expect(reported.status).toBe(200);
      const persisted = await reported.json();
      expect(await (await upload(payload)).json()).toMatchObject({ ...persisted, replayed: true });
      expect(await db.query.runs.findFirst({ where: (table, { eq }) => eq(table.id, persisted.runId) }))
        .toMatchObject({ source: "gitlab-pipeline", commitSha });
      const evidence = await readPrReleaseEvidence(projectId, pr.id);
      expect(evidence).toMatchObject({
        state: "awaiting_signoff", matrix: [{ status: "passed", runId: persisted.runId, providerRunId: "7654321" }],
      });
      const decision = { workspaceId: projectId, actorId: ownerId, pullRequestId: pr.id, digest: evidence!.digest! };
      liveSha = "d".repeat(40);
      await expect(signPrReleaseEvidence(decision)).rejects.toThrow("current provider head");
      liveSha = commitSha;
      expect(await signPrReleaseEvidence(decision)).toMatchObject({ actorId: ownerId });
    } finally {
      fake.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("permits legacy reads after cutting over the project", async () => {
    const legacy = await mint("agent");
    await db.update(workspaces).set({ legacyAgentWrites: false }).where(eq(workspaces.id, projectId));
    const legacyRequest = new Request("http://topology.test/api/agent", {
      headers: { Authorization: `Bearer ${legacy}` },
    });
    expect((await GET(legacyRequest)).status).toBe(200);
    const blocked = await POST(new Request(legacyRequest, {
      method: "POST", body: JSON.stringify({ action: "create_case", title: "Legacy write" }),
    }));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe("LEGACY_WRITE_DISABLED");
  });
});
