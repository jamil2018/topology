ALTER TYPE "public"."case_status" ADD VALUE IF NOT EXISTS 'in_review';
--> statement-breakpoint
CREATE TYPE "public"."notification_channel_kind" AS ENUM('slack', 'teams', 'smtp');
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "reviewer_id" uuid;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "reviewed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- to_tsvector/array_to_string are STABLE; generated columns require IMMUTABLE.
-- Thin SQL wrappers declare IMMUTABLE so STORED tsvector columns can be indexed.
CREATE OR REPLACE FUNCTION "topology_cases_search_vector"("key" text, "title" text, "description" text, "tags" text[]) RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT
    setweight(to_tsvector('english', coalesce("key", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string("tags", ' '), '')), 'C')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "topology_case_steps_search_vector"("action" text, "expected" text) RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT
    setweight(to_tsvector('english', coalesce("action", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("expected", '')), 'B')
$$;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  "topology_cases_search_vector"("key", "title", "description", "tags")
) STORED;
--> statement-breakpoint
CREATE INDEX "cases_search_vector_idx" ON "cases" USING gin ("search_vector");
--> statement-breakpoint
ALTER TABLE "case_steps" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  "topology_case_steps_search_vector"("action", "expected")
) STORED;
--> statement-breakpoint
CREATE INDEX "case_steps_search_vector_idx" ON "case_steps" USING gin ("search_vector");
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "endpoint_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "event" text NOT NULL,
  "delivery_id" text NOT NULL,
  "request_body" text NOT NULL,
  "response_status" integer,
  "response_excerpt" text DEFAULT '' NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "duration_ms" integer,
  "delivered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_id_idx" ON "webhook_deliveries" ("endpoint_id");
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_workspace_id_idx" ON "webhook_deliveries" ("workspace_id");
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_delivery_id_idx" ON "webhook_deliveries" ("delivery_id");
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_delivered_at_idx" ON "webhook_deliveries" ("delivered_at");
--> statement-breakpoint
CREATE TABLE "notification_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "kind" "notification_channel_kind" NOT NULL,
  "name" text NOT NULL,
  "config_json" text DEFAULT '{}' NOT NULL,
  "events" text DEFAULT 'assignment,mention,run.completed,coverage.dropped' NOT NULL,
  "enabled" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notification_channels_workspace_id_idx" ON "notification_channels" ("workspace_id");
