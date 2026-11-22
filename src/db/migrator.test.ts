import { readFileSync } from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";
import {
  resolveMigrationsFolder,
  resolveReconcileSqlPath,
  runMigrations,
  shouldReconcileUnstamped,
} from "./migrator";

describe("journaled migrator", () => {
  it("resolves the checked-in drizzle folder by default", () => {
    expect(resolveMigrationsFolder()).toBe(
      path.join(process.cwd(), "drizzle"),
    );
  });

  it("honors DRIZZLE_MIGRATIONS_FOLDER", () => {
    const previous = process.env.DRIZZLE_MIGRATIONS_FOLDER;
    process.env.DRIZZLE_MIGRATIONS_FOLDER = "./drizzle";
    try {
      expect(resolveMigrationsFolder("/tmp/topology")).toBe(
        path.resolve("/tmp/topology", "./drizzle"),
      );
    } finally {
      if (previous === undefined) delete process.env.DRIZZLE_MIGRATIONS_FOLDER;
      else process.env.DRIZZLE_MIGRATIONS_FOLDER = previous;
    }
  });

  it("exposes the baseline plus TCM, scale, and quality-graph pref through drizzle's journal", () => {
    const folder = resolveMigrationsFolder();
    const journal = JSON.parse(
      readFileSync(path.join(folder, "meta/_journal.json"), "utf8"),
    ) as { entries: { tag: string; idx: number }[] };

    expect(journal.entries).toHaveLength(16);
    expect(journal.entries[0]?.idx).toBe(0);
    expect(journal.entries[0]?.tag).toBe("0000_baseline");
    expect(journal.entries[1]?.idx).toBe(1);
    expect(journal.entries[1]?.tag).toBe("0001_tcm_parity");
    expect(journal.entries[2]?.idx).toBe(2);
    expect(journal.entries[2]?.tag).toBe("0002_scale");
    expect(journal.entries[3]?.idx).toBe(3);
    expect(journal.entries[3]?.tag).toBe("0003_quality_graph_pref");
    expect(journal.entries[7]?.idx).toBe(7);
    expect(journal.entries[7]?.tag).toBe("0007_collab_and_integrations");
    expect(journal.entries[8]?.idx).toBe(8);
    expect(journal.entries[8]?.tag).toBe("0008_triage_resolution");
    expect(journal.entries[9]?.idx).toBe(9);
    expect(journal.entries[9]?.tag).toBe("0009_scm_feedback");

    expect(journal.entries[10]?.tag).toBe("0010_agent_operations");

    expect(journal.entries[11]?.tag).toBe("0011_github_runner_requests");

    expect(journal.entries[12]?.tag).toBe("0012_vendor_case_sources");
    expect(journal.entries[13]?.tag).toBe("0013_regression_baselines");
    expect(journal.entries[14]?.tag).toBe("0014_case_review_policy");
    expect(journal.entries[15]?.tag).toBe("0015_vendor_run_history");

    const files = readMigrationFiles({ migrationsFolder: folder });
    expect(files).toHaveLength(16);
    const baseline = files[0]!.sql.join("\n");
    expect(baseline).toContain('CREATE TABLE "users"');
    expect(baseline).toContain('CREATE TABLE "attachments"');
    expect(baseline).toContain('CREATE TABLE "api_tokens"');
    expect(baseline).toContain('CREATE TABLE "login_rate_limits"');
    expect(baseline).toContain('CREATE TABLE "audit_events"');
    expect(baseline).toContain('"scope" text DEFAULT \'read,ci-write,agent\' NOT NULL');
    expect(baseline).toContain('"webhook_secret"');
    const tcm = files[1]!.sql.join("\n");
    expect(tcm).toContain('CREATE TABLE "case_steps"');
    expect(tcm).toContain('CREATE TABLE "test_plans"');
    expect(tcm).toContain('CREATE TABLE "case_versions"');
    expect(tcm).toContain('CREATE TABLE "custom_field_defs"');
    const scale = files[2]!.sql.join("\n");
    expect(scale).toContain("ADD VALUE IF NOT EXISTS 'gitlab'");
    expect(scale).toContain("run_results_run_id_idx");
    expect(scale).toContain("run_results_case_id_created_at_idx");
    expect(scale).toContain("runs_plan_id_idx");
    expect(scale).toContain("case_steps_case_id_idx");
    const pref = files[3]!.sql.join("\n");
    expect(pref).toContain("quality_graph_enabled");
    const collab = files[7]!.sql.join("\n");
    expect(collab).toContain("ADD VALUE IF NOT EXISTS 'in_review'");
    expect(collab).toContain('CREATE TABLE "webhook_deliveries"');
    expect(collab).toContain('CREATE TABLE "notification_channels"');
    expect(collab).toContain("cases_search_vector_idx");
    expect(collab).toContain("case_steps_search_vector_idx");
    const resolution = files[8]!.sql.join("\n");
    expect(resolution).toContain('"resolution"');
    expect(resolution).toContain("triage_items");
    const scm = files[9]!.sql.join("\n");
    expect(scm).toContain("post_pr_status_checks");
    expect(scm).toContain("post_pr_summary_comment");
  });

  it("reconciles only when tables exist and the journal is empty", () => {
    expect(
      shouldReconcileUnstamped({
        usersTableExists: true,
        migrationRowCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldReconcileUnstamped({
        usersTableExists: true,
        migrationRowCount: null,
      }),
    ).toBe(true);
    expect(
      shouldReconcileUnstamped({
        usersTableExists: true,
        migrationRowCount: 3,
      }),
    ).toBe(false);
    expect(
      shouldReconcileUnstamped({
        usersTableExists: false,
        migrationRowCount: 0,
      }),
    ).toBe(false);
  });

  it("covers the columns missing from leftover push-era volumes", () => {
    const sql = readFileSync(resolveReconcileSqlPath(), "utf8");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "audit_events"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "test_plans"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "plan_id"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "scope"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "webhook_secret"');
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'gitlab'");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "quality_graph_enabled"');
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'in_review'");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "webhook_deliveries"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "notification_channels"');
    expect(sql).toContain("cases_search_vector_idx");
    expect(sql).toContain("case_steps_search_vector_idx");
    expect(sql).toContain('"resolution"');
    expect(sql).toContain("post_pr_status_checks");
    expect(sql).toContain("post_pr_summary_comment");
  });

  it("refuses to run without DATABASE_URL", async () => {
    await expect(
      runMigrations({
        databaseUrl: "",
        migrationsFolder: resolveMigrationsFolder(),
      }),
    ).rejects.toThrow(/DATABASE_URL is not set/);
  });
});
