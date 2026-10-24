-- Idempotent catch-up for databases created with drizzle-kit push (empty journal).
-- Safe to re-run. Journaled 0000–0003 already cover fresh databases.

CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata_json" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "login_rate_limits" (
	"identifier" text PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp
);

ALTER TABLE "api_tokens" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'read,ci-write,agent' NOT NULL;
ALTER TABLE "api_tokens" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;
ALTER TABLE "api_tokens" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp;
ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "webhook_secret" text;

DO $$ BEGIN
  CREATE TYPE "public"."custom_field_entity" AS ENUM('case', 'result');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'boolean', 'select', 'date');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."test_plan_status" AS ENUM('draft', 'active', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "case_dataset_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"values_json" text DEFAULT '{}' NOT NULL,
	CONSTRAINT "case_dataset_rows_case_id_position_unique" UNIQUE("case_id","position")
);

CREATE TABLE IF NOT EXISTS "case_parameters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_value" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "case_parameters_case_id_name_unique" UNIQUE("case_id","name")
);

CREATE TABLE IF NOT EXISTS "shared_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "case_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"expected" text DEFAULT '' NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	"shared_step_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "case_steps_case_id_position_unique" UNIQUE("case_id","position")
);

CREATE TABLE IF NOT EXISTS "case_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot_json" text NOT NULL,
	"activity_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "case_versions_case_id_version_unique" UNIQUE("case_id","version")
);

CREATE TABLE IF NOT EXISTS "custom_field_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity" "custom_field_entity" NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "custom_field_type" DEFAULT 'text' NOT NULL,
	"options_json" text,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_defs_workspace_id_entity_key_unique" UNIQUE("workspace_id","entity","key")
);

CREATE TABLE IF NOT EXISTS "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"value_json" text NOT NULL,
	CONSTRAINT "custom_field_values_field_id_entity_type_entity_id_unique" UNIQUE("field_id","entity_type","entity_id")
);

CREATE TABLE IF NOT EXISTS "run_step_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"case_step_id" uuid,
	"shared_step_id" uuid,
	"action" text NOT NULL,
	"expected" text DEFAULT '' NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	"status" "result_status" DEFAULT 'untested' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "run_step_results_result_id_position_unique" UNIQUE("result_id","position")
);

CREATE TABLE IF NOT EXISTS "shared_step_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shared_step_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"action" text NOT NULL,
	"expected" text DEFAULT '' NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	CONSTRAINT "shared_step_items_shared_step_id_position_unique" UNIQUE("shared_step_id","position")
);

CREATE TABLE IF NOT EXISTS "test_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "test_plan_status" DEFAULT 'draft' NOT NULL,
	"milestone_id" uuid,
	"matrix_json" text DEFAULT '{"browsers":[],"operatingSystems":[],"environmentIds":[]}' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "test_plan_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "test_plan_cases_plan_id_case_id_unique" UNIQUE("plan_id","case_id")
);

ALTER TABLE "run_results" ADD COLUMN IF NOT EXISTS "iteration_index" integer DEFAULT 0 NOT NULL;
ALTER TABLE "run_results" ADD COLUMN IF NOT EXISTS "iteration_values_json" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "plan_id" uuid;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "matrix_browser" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "matrix_os" text;

DO $$ BEGIN
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_dataset_rows" ADD CONSTRAINT "case_dataset_rows_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_parameters" ADD CONSTRAINT "case_parameters_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "shared_steps" ADD CONSTRAINT "shared_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "shared_steps" ADD CONSTRAINT "shared_steps_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_shared_step_id_shared_steps_id_fk" FOREIGN KEY ("shared_step_id") REFERENCES "public"."shared_steps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_activity_id_case_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."case_activities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "custom_field_defs" ADD CONSTRAINT "custom_field_defs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_field_id_custom_field_defs_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_field_defs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "run_step_results" ADD CONSTRAINT "run_step_results_result_id_run_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."run_results"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "run_step_results" ADD CONSTRAINT "run_step_results_case_step_id_case_steps_id_fk" FOREIGN KEY ("case_step_id") REFERENCES "public"."case_steps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "run_step_results" ADD CONSTRAINT "run_step_results_shared_step_id_shared_steps_id_fk" FOREIGN KEY ("shared_step_id") REFERENCES "public"."shared_steps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "shared_step_items" ADD CONSTRAINT "shared_step_items_shared_step_id_shared_steps_id_fk" FOREIGN KEY ("shared_step_id") REFERENCES "public"."shared_steps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_plan_id_test_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."test_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "runs" ADD CONSTRAINT "runs_plan_id_test_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."test_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "public"."issue_provider" ADD VALUE IF NOT EXISTS 'gitlab';

CREATE INDEX IF NOT EXISTS "case_activities_case_id_idx" ON "case_activities" USING btree ("case_id");
CREATE INDEX IF NOT EXISTS "case_steps_case_id_idx" ON "case_steps" USING btree ("case_id");
CREATE INDEX IF NOT EXISTS "case_steps_workspace_id_idx" ON "case_steps" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "case_steps_shared_step_id_idx" ON "case_steps" USING btree ("shared_step_id");
CREATE INDEX IF NOT EXISTS "case_versions_workspace_id_idx" ON "case_versions" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "cases_folder_id_idx" ON "cases" USING btree ("folder_id");
CREATE INDEX IF NOT EXISTS "cases_intent_id_idx" ON "cases" USING btree ("intent_id");
CREATE INDEX IF NOT EXISTS "custom_field_values_entity_idx" ON "custom_field_values" USING btree ("entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "folders_workspace_id_idx" ON "folders" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "folders_parent_id_idx" ON "folders" USING btree ("parent_id");
CREATE INDEX IF NOT EXISTS "linked_issues_workspace_id_idx" ON "linked_issues" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "linked_issues_case_id_idx" ON "linked_issues" USING btree ("case_id");
CREATE INDEX IF NOT EXISTS "linked_issues_result_id_idx" ON "linked_issues" USING btree ("result_id");
CREATE INDEX IF NOT EXISTS "linked_issues_run_id_idx" ON "linked_issues" USING btree ("run_id");
CREATE INDEX IF NOT EXISTS "milestones_workspace_id_idx" ON "milestones" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "milestones_folder_id_idx" ON "milestones" USING btree ("folder_id");
CREATE INDEX IF NOT EXISTS "quality_edges_workspace_id_idx" ON "quality_edges" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "quality_edges_from_idx" ON "quality_edges" USING btree ("from_type","from_id");
CREATE INDEX IF NOT EXISTS "quality_edges_to_idx" ON "quality_edges" USING btree ("to_type","to_id");
CREATE INDEX IF NOT EXISTS "result_comments_result_id_idx" ON "result_comments" USING btree ("result_id");
CREATE INDEX IF NOT EXISTS "run_results_run_id_idx" ON "run_results" USING btree ("run_id");
CREATE INDEX IF NOT EXISTS "run_results_case_id_created_at_idx" ON "run_results" USING btree ("case_id","created_at");
CREATE INDEX IF NOT EXISTS "run_results_implementation_id_idx" ON "run_results" USING btree ("implementation_id");
CREATE INDEX IF NOT EXISTS "run_shards_run_id_idx" ON "run_shards" USING btree ("run_id");
CREATE INDEX IF NOT EXISTS "run_step_results_case_step_id_idx" ON "run_step_results" USING btree ("case_step_id");
CREATE INDEX IF NOT EXISTS "runs_workspace_id_idx" ON "runs" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "runs_workspace_kind_idx" ON "runs" USING btree ("workspace_id","kind");
CREATE INDEX IF NOT EXISTS "runs_plan_id_idx" ON "runs" USING btree ("plan_id");
CREATE INDEX IF NOT EXISTS "runs_environment_id_idx" ON "runs" USING btree ("environment_id");
CREATE INDEX IF NOT EXISTS "saved_views_workspace_id_idx" ON "saved_views" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "test_implementations_workspace_id_idx" ON "test_implementations" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "test_implementations_intent_id_idx" ON "test_implementations" USING btree ("intent_id");
CREATE INDEX IF NOT EXISTS "test_implementations_case_id_idx" ON "test_implementations" USING btree ("case_id");
CREATE INDEX IF NOT EXISTS "test_intents_folder_id_idx" ON "test_intents" USING btree ("folder_id");
CREATE INDEX IF NOT EXISTS "test_plan_cases_case_id_idx" ON "test_plan_cases" USING btree ("case_id");
CREATE INDEX IF NOT EXISTS "test_plans_workspace_id_idx" ON "test_plans" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "test_plans_milestone_id_idx" ON "test_plans" USING btree ("milestone_id");
CREATE INDEX IF NOT EXISTS "triage_items_workspace_id_idx" ON "triage_items" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "triage_items_case_id_idx" ON "triage_items" USING btree ("case_id");
CREATE INDEX IF NOT EXISTS "triage_items_run_id_idx" ON "triage_items" USING btree ("run_id");
CREATE INDEX IF NOT EXISTS "triage_items_result_id_idx" ON "triage_items" USING btree ("result_id");

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "quality_graph_enabled" boolean DEFAULT false NOT NULL;
