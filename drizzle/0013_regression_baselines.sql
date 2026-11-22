CREATE TABLE "regression_baselines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "plan_id" uuid REFERENCES "test_plans"("id") ON DELETE set null,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "case_snapshots" jsonb NOT NULL,
  "cells" jsonb NOT NULL,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "regression_baselines_project_plan_idx" ON "regression_baselines" ("workspace_id", "plan_id");
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "baseline_id" uuid REFERENCES "regression_baselines"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "run_results" ADD COLUMN "case_snapshot" jsonb;
