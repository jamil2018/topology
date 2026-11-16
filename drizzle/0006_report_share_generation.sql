ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "share_generation" integer DEFAULT 0 NOT NULL;
