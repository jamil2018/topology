-- Phase 2: environments, representation, typed attachments, result extras

DO $$ BEGIN
  CREATE TYPE environment_kind AS ENUM (
    'local', 'ci', 'staging', 'prod'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE attachment_kind AS ENUM (
    'screenshot', 'log', 'video', 'trace', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind environment_kind NOT NULL DEFAULT 'local',
  metadata_json text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

ALTER TABLE test_intents
  ADD COLUMN IF NOT EXISTS representation_json text;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS environment_id uuid REFERENCES environments(id) ON DELETE SET NULL;

ALTER TABLE run_results
  ADD COLUMN IF NOT EXISTS implementation_id uuid REFERENCES test_implementations(id) ON DELETE SET NULL;

ALTER TABLE run_results
  ADD COLUMN IF NOT EXISTS environment_json text;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS kind attachment_kind NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS environments_workspace_id_idx ON environments(workspace_id);
CREATE INDEX IF NOT EXISTS runs_environment_id_idx ON runs(environment_id);
CREATE INDEX IF NOT EXISTS run_results_implementation_id_idx ON run_results(implementation_id);
