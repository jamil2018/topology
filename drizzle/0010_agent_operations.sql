ALTER TABLE "workspaces" ADD COLUMN "legacy_agent_writes" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "workspaces" SET "legacy_agent_writes" = true
WHERE EXISTS (
  SELECT 1 FROM "api_tokens"
  WHERE "api_tokens"."workspace_id" = "workspaces"."id"
    AND 'agent' = ANY(regexp_split_to_array("api_tokens"."scope", '\s*,\s*'))
    AND "api_tokens"."revoked_at" IS NULL
    AND ("api_tokens"."expires_at" IS NULL OR "api_tokens"."expires_at" > now())
);
--> statement-breakpoint
CREATE TABLE "agent_operations" (
  "token_id" uuid NOT NULL REFERENCES "api_tokens"("id") ON DELETE cascade,
  "key" text NOT NULL,
  "request_hash" text NOT NULL,
  "status" integer NOT NULL,
  "response" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("token_id", "key")
);
--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "head_sha" text;
