CREATE TABLE "github_runner_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "repository_id" uuid NOT NULL REFERENCES "repositories"("id") ON DELETE cascade,
  "pull_request_id" uuid NOT NULL REFERENCES "pull_requests"("id") ON DELETE cascade,
  "reporter_token_id" uuid REFERENCES "api_tokens"("id") ON DELETE set null,
  "commit_sha" text NOT NULL,
  "workflow" text NOT NULL,
  "ref" text NOT NULL,
  "environment" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "detail" text,
  "provider_run_id" text,
  "topology_run_id" uuid REFERENCES "runs"("id") ON DELETE set null,
  "report_hash" text,
  "case_revisions" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "github_runner_requests_provider_unique" UNIQUE ("repository_id", "provider_run_id")
);
--> statement-breakpoint
CREATE INDEX "github_runner_requests_workspace_idx" ON "github_runner_requests" ("workspace_id");
--> statement-breakpoint
ALTER TABLE "run_results" ADD COLUMN "case_revision" text;
--> statement-breakpoint
ALTER TABLE "run_results" ADD COLUMN "evidence_match" text;
--> statement-breakpoint
CREATE TABLE "pr_release_signoffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "pull_request_id" uuid NOT NULL REFERENCES "pull_requests"("id") ON DELETE cascade,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "commit_sha" text NOT NULL,
  "digest" text NOT NULL,
  "evidence" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pr_release_signoffs_evidence_unique" UNIQUE ("pull_request_id", "digest")
);
