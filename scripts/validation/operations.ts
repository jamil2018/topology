import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { runMigrations } from "../../src/db/migrator";
import { assertOwnedDatabase } from "./safety";
import { assertUpgradeFixture, attachment, seedUpgradeFixture } from "./upgrade-fixture";

function journalRows(migrationsFolder: string) {
  return readMigrationFiles({ migrationsFolder }).map(({ hash, folderMillis }) => ({ hash, created_at: String(folderMillis) }));
}

const readJournal = async (sql: postgres.Sql) => [...await sql`SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id`];
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export async function evaluateOperations(options: {
  adminUrl: string; runId: string; created: Set<string>; compose: string[]; temporaryRoot: string; output: string; s3Endpoint: string; bucket: string;
}) {
  const { adminUrl, runId, created, compose, temporaryRoot } = options;
  const url = new URL(adminUrl);
  const migration = `topology_validation_${runId}_migration`;
  const restore = `topology_validation_${runId}_restore`;
  assertOwnedDatabase(migration, created); assertOwnedDatabase(restore, created);
  url.pathname = `/${migration}`;
  const migrationUrl = url.toString();
  const prior = path.join(temporaryRoot, "prior-migrations");
  cpSync("drizzle", prior, { recursive: true });
  const journalFile = path.join(prior, "meta/_journal.json");
  const journal: { entries: { tag: string }[] } = JSON.parse(readFileSync(journalFile, "utf8"));
  const priorIndex = journal.entries.findIndex(({ tag }) => tag === "0009_scm_feedback");
  assert.equal(journal.entries[0]?.tag, "0000_baseline");
  assert.ok(priorIndex >= 0 && priorIndex < journal.entries.length - 1);

  const expectedJournal = journalRows("drizzle");
  writeFileSync(journalFile, JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
  await runMigrations({ databaseUrl: migrationUrl, migrationsFolder: prior });
  const sql = postgres(migrationUrl, { max: 1 });
  const fixture = await (async () => {
    try {
      assert.deepEqual(await readJournal(sql), expectedJournal.slice(0, 1));
      const seeded = await seedUpgradeFixture(sql);
      writeFileSync(journalFile, JSON.stringify({ ...journal, entries: journal.entries.slice(0, priorIndex + 1) }));
      await runMigrations({ databaseUrl: migrationUrl, migrationsFolder: prior });
      assert.deepEqual(await readJournal(sql), expectedJournal.slice(0, priorIndex + 1));
      await runMigrations({ databaseUrl: migrationUrl });
      await sql`INSERT INTO workspaces (name, slug) VALUES ('New project', 'new')`;
      await assertUpgradeFixture(sql, seeded);
      assert.deepEqual(await readJournal(sql), expectedJournal);
      await runMigrations({ databaseUrl: migrationUrl });
      assert.deepEqual(await readJournal(sql), expectedJournal);
      await assertUpgradeFixture(sql, seeded);
      return seeded;
    } finally { await sql.end({ timeout: 5 }); }
  })();
  const container = execFileSync("docker", [...compose, "ps", "-q", "postgres"], { encoding: "utf8" }).trim();
  const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "validation", "-d", migration, "--format=custom"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("docker", ["exec", "-i", container, "pg_restore", "-U", "validation", "-d", restore, "--exit-on-error"], { input: dump });
  url.pathname = `/${restore}`;
  const restored = postgres(url.toString(), { max: 1 });
  try {
    await assertUpgradeFixture(restored, fixture);
    assert.deepEqual(await readJournal(restored), expectedJournal);
  } finally { await restored.end({ timeout: 5 }); }
  const s3 = new S3Client({ endpoint: options.s3Endpoint, region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "validation", secretAccessKey: "validation-local-only" } });
  let restartedEndpoint = options.s3Endpoint;
  try {
    const checksum = sha256(attachment.body);
    await s3.send(new PutObjectCommand({ Bucket: options.bucket, Key: attachment.key, Body: attachment.body }));
    execFileSync("docker", [...compose, "restart", "postgres", "minio"]);
    execFileSync("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "60", "postgres", "minio"]);
    // Docker may allocate new ephemeral host ports when a container restarts.
    const port = (service: string, target: string) => execFileSync("docker", [...compose, "port", service, target], { encoding: "utf8" }).trim().split(":").at(-1)!;
    const postgresPort = port("postgres", "5432");
    const endpoint = new URL(options.s3Endpoint);
    endpoint.port = port("minio", "9000");
    url.port = postgresPort;
    const persisted = postgres(url.toString(), { max: 1, connect_timeout: 10 });
    try {
      await assertUpgradeFixture(persisted, fixture);
    } finally { await persisted.end(); }
    const afterRestart = new S3Client({ endpoint: endpoint.origin, region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: "validation", secretAccessKey: "validation-local-only" } });
    try {
      const stored = await afterRestart.send(new GetObjectCommand({ Bucket: options.bucket, Key: attachment.key }));
      assert.ok(stored.Body);
      assert.equal(sha256(await stored.Body.transformToByteArray()), checksum);
    } finally { afterRestart.destroy(); }
    restartedEndpoint = endpoint.origin;
  } finally { s3.destroy(); }
  const receipt = {
    operation: "populated upgrade, migration idempotency, database restore, and object persistence after restart",
    status: "passed",
    starting: journal.entries[0].tag,
    checkpoint: journal.entries[priorIndex].tag,
    final: journal.entries.at(-1)!.tag,
    journalEntries: expectedJournal.length,
    dumpBytes: dump.length,
    attachmentSha256: sha256(attachment.body),
  };
  writeFileSync(path.join(options.output, "operations.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
  return { postgresPort: url.port, s3Endpoint: restartedEndpoint };
}
