import assert from "node:assert/strict";
import type postgres from "postgres";

export const attachment = {
  key: "upgrade-evidence.txt",
  body: "Checkout result evidence — preserved after upgrade.\n",
};

export async function seedUpgradeFixture(sql: postgres.Sql) {
  const [{ id: userId }] = await sql`
    INSERT INTO users (name, email) VALUES ('Upgrade tester', 'upgrade@example.test') RETURNING id
  `;
  const [{ id: projectId }] = await sql`
    INSERT INTO workspaces (name, slug) VALUES ('Upgrade evidence', 'upgrade') RETURNING id
  `;
  await sql`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${projectId}, ${userId}, 'admin')`;
  const [{ id: caseId }] = await sql`
    INSERT INTO cases (workspace_id, key, title, status)
    VALUES (${projectId}, 'UP-1', 'Check checkout', 'ready') RETURNING id
  `;
  const [{ id: runId }] = await sql`
    INSERT INTO runs (workspace_id, name, status, completed_at)
    VALUES (${projectId}, 'Preserved report', 'completed', '2025-01-01T12:00:00Z') RETURNING id
  `;
  const [{ id: resultId }] = await sql`
    INSERT INTO run_results (run_id, case_id, status, notes)
    VALUES (${runId}, ${caseId}, 'failed', 'Fixture failure') RETURNING id
  `;
  const [{ id: attachmentId }] = await sql`
    INSERT INTO attachments (result_id, filename, content_type, storage_key, size_bytes)
    VALUES (${resultId}, ${attachment.key}, 'text/plain', ${attachment.key}, ${Buffer.byteLength(attachment.body)})
    RETURNING id
  `;
  const [{ id: requirementId }] = await sql`
    INSERT INTO requirements (workspace_id, key, title)
    VALUES (${projectId}, 'REQ-UP', 'Checkout requirement') RETURNING id
  `;
  const [{ id: intentId }] = await sql`
    INSERT INTO test_intents (workspace_id, key, title)
    VALUES (${projectId}, 'INT-UP', 'Checkout intent') RETURNING id
  `;
  const [{ id: edgeId }] = await sql`
    INSERT INTO quality_edges (workspace_id, from_type, from_id, to_type, to_id, relation)
    VALUES (${projectId}, 'requirement', ${requirementId}, 'intent', ${intentId}, 'covers') RETURNING id
  `;
  const accounts = await sql`
    INSERT INTO workspaces (name, slug) VALUES ('Expired', 'expired'), ('Revoked', 'revoked'), ('Read only', 'read-only')
    RETURNING id, slug
  `;
  await sql`
    INSERT INTO api_tokens (workspace_id, name, token_hash, token_prefix, scope, user_id)
    VALUES (${projectId}, 'Legacy agent', 'upgrade-active', 'upgrade-', 'read, agent', ${userId})
  `;
  for (const account of accounts) {
    await sql`
      INSERT INTO api_tokens (workspace_id, name, token_hash, token_prefix, scope, expires_at, revoked_at)
      VALUES (${account.id}, ${account.slug}, ${account.slug}, 'upgrade-',
        ${account.slug === "read-only" ? "read" : "agent"},
        ${account.slug === "expired" ? "2000-01-01" : null},
        ${account.slug === "revoked" ? "2000-01-01" : null})
    `;
  }
  return { projectId, userId, caseId, runId, resultId, attachmentId, requirementId, intentId, edgeId };
}

export async function assertUpgradeFixture(sql: postgres.Sql, fixture: Awaited<ReturnType<typeof seedUpgradeFixture>>) {
  assert.deepEqual([...await sql`
    SELECT m.user_id, m.role, c.id AS case_id, c.key, c.title, c.status AS case_status,
      r.id AS run_id, r.name, r.status AS run_status, r.share_generation,
      rr.id AS result_id, rr.status AS result_status, rr.notes, a.id AS attachment_id, a.storage_key, a.size_bytes
    FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id
    JOIN cases c ON c.workspace_id = w.id
    JOIN runs r ON r.workspace_id = w.id
    JOIN run_results rr ON rr.run_id = r.id AND rr.case_id = c.id
    JOIN attachments a ON a.result_id = rr.id
    WHERE w.id = ${fixture.projectId}
  `], [{
    user_id: fixture.userId, role: "admin", case_id: fixture.caseId, key: "UP-1", title: "Check checkout",
    case_status: "ready", run_id: fixture.runId, name: "Preserved report", run_status: "completed",
    share_generation: 0, result_id: fixture.resultId, result_status: "failed", notes: "Fixture failure",
    attachment_id: fixture.attachmentId, storage_key: attachment.key, size_bytes: Buffer.byteLength(attachment.body),
  }]);
  assert.deepEqual([...await sql`
    SELECT e.from_id, e.to_id, e.reviewed_jira_revision, q.title
    FROM quality_edges e JOIN requirements q ON q.id = e.from_id WHERE e.id = ${fixture.edgeId}
  `], [{
    from_id: fixture.requirementId, to_id: fixture.intentId, reviewed_jira_revision: 0, title: "Checkout requirement",
  }]);
  assert.deepEqual([...await sql`
    SELECT slug, legacy_agent_writes, require_case_review FROM workspaces ORDER BY slug
  `], [
    { slug: "expired", legacy_agent_writes: false, require_case_review: false },
    { slug: "new", legacy_agent_writes: false, require_case_review: false },
    { slug: "read-only", legacy_agent_writes: false, require_case_review: false },
    { slug: "revoked", legacy_agent_writes: false, require_case_review: false },
    { slug: "upgrade", legacy_agent_writes: true, require_case_review: false },
  ]);
}
