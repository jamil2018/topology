CREATE TABLE "case_import_sources" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "namespace" text NOT NULL,
  "source_id" text NOT NULL,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE cascade,
  CONSTRAINT "case_import_sources_identity_unique" UNIQUE ("workspace_id", "provider", "namespace", "source_id")
);
--> statement-breakpoint
CREATE INDEX "case_import_sources_case_idx" ON "case_import_sources" ("case_id");
