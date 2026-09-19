-- Phase 8: historical coverage snapshots (compare over time)

DO $$ BEGIN
  CREATE TYPE coverage_snapshot_source AS ENUM ('nightly', 'release', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS coverage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  captured_at timestamp NOT NULL DEFAULT now(),
  label text,
  source coverage_snapshot_source NOT NULL DEFAULT 'manual',
  dimensions_json text NOT NULL,
  gaps_json text,
  release_id uuid REFERENCES releases(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coverage_snapshots_workspace_captured_idx
  ON coverage_snapshots (workspace_id, captured_at DESC);
