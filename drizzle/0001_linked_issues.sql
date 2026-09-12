-- Linked issues + enums for Topology issue integrations
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE issue_provider AS ENUM ('mock', 'jira', 'linear', 'github');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE issue_remote_status AS ENUM ('open', 'in_progress', 'done', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS linked_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider issue_provider NOT NULL,
  remote_id text NOT NULL,
  remote_key text NOT NULL,
  url text NOT NULL,
  title text NOT NULL,
  remote_status issue_remote_status NOT NULL DEFAULT 'open',
  result_id uuid REFERENCES run_results(id) ON DELETE SET NULL,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  run_id uuid REFERENCES runs(id) ON DELETE SET NULL,
  needs_retest integer NOT NULL DEFAULT 0,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_synced_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
