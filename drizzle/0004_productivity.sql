ALTER TABLE "saved_views" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL CHECK (visibility IN ('private', 'team'));
--> statement-breakpoint
CREATE TABLE "run_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "case_ids" uuid[] NOT NULL,
  "environment" text DEFAULT 'local' NOT NULL,
  "assignee_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "run_templates_workspace_idx" ON "run_templates" ("workspace_id");
--> statement-breakpoint
CREATE TABLE "retest_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_result_id" uuid NOT NULL REFERENCES "run_results"("id") ON DELETE CASCADE,
  "result_id" uuid NOT NULL REFERENCES "run_results"("id") ON DELETE CASCADE,
  UNIQUE ("source_result_id", "result_id")
);
--> statement-breakpoint
CREATE INDEX "retest_sources_result_idx" ON "retest_sources" ("result_id");
