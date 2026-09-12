-- Per-user theme preference (synced with localStorage topology-theme)
DO $$ BEGIN
  CREATE TYPE theme_preference AS ENUM ('system', 'light', 'dark');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme_preference theme_preference NOT NULL DEFAULT 'system';
