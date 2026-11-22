CREATE TABLE IF NOT EXISTS "jira_requirement_sources" (
  "requirement_id" uuid PRIMARY KEY REFERENCES "requirements"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "origin" text NOT NULL,
  "project_id" text NOT NULL,
  "issue_id" text NOT NULL,
  "issue_key" text,
  "revision" integer DEFAULT 0 NOT NULL,
  "content_hash" text,
  "remote_updated_at" timestamptz,
  CONSTRAINT "jira_requirement_sources_issue_unique" UNIQUE ("workspace_id", "origin", "project_id", "issue_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jira_requirement_revisions" (
  "requirement_id" uuid NOT NULL REFERENCES "jira_requirement_sources"("requirement_id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "source_updated_at" timestamptz NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "source_description" jsonb,
  PRIMARY KEY ("requirement_id", "revision")
);
--> statement-breakpoint
ALTER TABLE "quality_edges" ADD COLUMN IF NOT EXISTS "reviewed_jira_revision" integer DEFAULT 0 NOT NULL;
