ALTER TABLE "run_templates" DROP CONSTRAINT IF EXISTS "run_templates_assignee_id_fkey";
--> statement-breakpoint
CREATE TABLE "result_case_links" (
  "result_id" uuid PRIMARY KEY REFERENCES "run_results"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
