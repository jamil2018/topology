ALTER TABLE "repositories" ADD COLUMN "post_pr_status_checks" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "post_pr_summary_comment" boolean DEFAULT false NOT NULL;
