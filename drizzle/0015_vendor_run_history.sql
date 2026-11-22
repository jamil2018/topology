CREATE TABLE "vendor_run_history" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "namespace" text NOT NULL,
  "source_run_id" text NOT NULL,
  "digest" text NOT NULL,
  "run_id" uuid REFERENCES "runs"("id") ON DELETE set null,
  CONSTRAINT "vendor_run_history_identity_unique" UNIQUE ("workspace_id", "provider", "namespace", "source_run_id")
);
CREATE INDEX "vendor_run_history_run_idx" ON "vendor_run_history" ("run_id");
