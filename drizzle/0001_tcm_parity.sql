CREATE TYPE "public"."custom_field_entity" AS ENUM('case', 'result');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'boolean', 'select', 'date');--> statement-breakpoint
CREATE TYPE "public"."test_plan_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "case_dataset_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"values_json" text DEFAULT '{}' NOT NULL,
	CONSTRAINT "case_dataset_rows_case_id_position_unique" UNIQUE("case_id","position")
);
--> statement-breakpoint
CREATE TABLE "case_parameters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_value" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "case_parameters_case_id_name_unique" UNIQUE("case_id","name")
);
--> statement-breakpoint
CREATE TABLE "case_steps" (
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
--> statement-breakpoint
CREATE TABLE "case_versions" (
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
--> statement-breakpoint
CREATE TABLE "custom_field_defs" (
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
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"value_json" text NOT NULL,
	CONSTRAINT "custom_field_values_field_id_entity_type_entity_id_unique" UNIQUE("field_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "run_step_results" (
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
--> statement-breakpoint
CREATE TABLE "shared_step_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shared_step_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"action" text NOT NULL,
	"expected" text DEFAULT '' NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	CONSTRAINT "shared_step_items_shared_step_id_position_unique" UNIQUE("shared_step_id","position")
);
--> statement-breakpoint
CREATE TABLE "shared_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_plan_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "test_plan_cases_plan_id_case_id_unique" UNIQUE("plan_id","case_id")
);
--> statement-breakpoint
CREATE TABLE "test_plans" (
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
--> statement-breakpoint
ALTER TABLE "run_results" ADD COLUMN "iteration_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "run_results" ADD COLUMN "iteration_values_json" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "matrix_browser" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "matrix_os" text;--> statement-breakpoint
ALTER TABLE "case_dataset_rows" ADD CONSTRAINT "case_dataset_rows_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_parameters" ADD CONSTRAINT "case_parameters_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_shared_step_id_shared_steps_id_fk" FOREIGN KEY ("shared_step_id") REFERENCES "public"."shared_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_activity_id_case_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."case_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_defs" ADD CONSTRAINT "custom_field_defs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_field_id_custom_field_defs_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_field_defs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_step_results" ADD CONSTRAINT "run_step_results_result_id_run_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."run_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_step_results" ADD CONSTRAINT "run_step_results_case_step_id_case_steps_id_fk" FOREIGN KEY ("case_step_id") REFERENCES "public"."case_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_step_results" ADD CONSTRAINT "run_step_results_shared_step_id_shared_steps_id_fk" FOREIGN KEY ("shared_step_id") REFERENCES "public"."shared_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_step_items" ADD CONSTRAINT "shared_step_items_shared_step_id_shared_steps_id_fk" FOREIGN KEY ("shared_step_id") REFERENCES "public"."shared_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_steps" ADD CONSTRAINT "shared_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_steps" ADD CONSTRAINT "shared_steps_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_plan_id_test_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."test_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_plan_id_test_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."test_plans"("id") ON DELETE set null ON UPDATE no action;