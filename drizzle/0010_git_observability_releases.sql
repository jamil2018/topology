-- Phases 3–5: git entities, observability rollups, releases + journeys

DO $$ BEGIN
  CREATE TYPE repository_provider AS ENUM ('github', 'gitlab', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pull_request_status AS ENUM ('open', 'closed', 'merged', 'draft');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend quality graph enums for journeys
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'quality_entity_type' AND e.enumlabel = 'journey'
  ) THEN
    ALTER TYPE quality_entity_type ADD VALUE 'journey';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'quality_relation' AND e.enumlabel = 'part_of'
  ) THEN
    ALTER TYPE quality_relation ADD VALUE 'part_of';
  END IF;
END $$;

-- Phase 3: repositories, commits, pull requests, path→component rules
CREATE TABLE IF NOT EXISTS repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider repository_provider NOT NULL DEFAULT 'github',
  remote_url text NOT NULL,
  default_branch text NOT NULL DEFAULT 'main',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, remote_url)
);

CREATE TABLE IF NOT EXISTS commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  sha text NOT NULL,
  message text NOT NULL DEFAULT '',
  committed_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (repository_id, sha)
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text NOT NULL,
  base text NOT NULL,
  head text NOT NULL,
  status pull_request_status NOT NULL DEFAULT 'open',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (repository_id, number)
);

CREATE TABLE IF NOT EXISTS path_component_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pattern text NOT NULL,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, pattern)
);

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS pull_request_id uuid REFERENCES pull_requests(id) ON DELETE SET NULL;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS commit_id uuid REFERENCES commits(id) ON DELETE SET NULL;

-- Phase 4: implementation rollups, failure signatures, result error fields
CREATE TABLE IF NOT EXISTS implementation_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implementation_id uuid NOT NULL REFERENCES test_implementations(id) ON DELETE CASCADE,
  window_days integer NOT NULL,
  pass_rate double precision,
  flake_probability double precision,
  duration_p50 integer,
  duration_p95 integer,
  last_run_at timestamp,
  last_status result_status,
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (implementation_id, window_days)
);

CREATE TABLE IF NOT EXISTS failure_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  hash text NOT NULL,
  normalized_message text NOT NULL DEFAULT '',
  stack_top text NOT NULL DEFAULT '',
  occurrence_count integer NOT NULL DEFAULT 1,
  last_seen_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, hash)
);

ALTER TABLE triage_items
  ADD COLUMN IF NOT EXISTS signature_id uuid REFERENCES failure_signatures(id) ON DELETE SET NULL;

ALTER TABLE run_results
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE run_results
  ADD COLUMN IF NOT EXISTS stack text;

-- Phase 5: journeys, releases, release snapshots
CREATE TABLE IF NOT EXISTS journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  criticality case_priority NOT NULL DEFAULT 'P2',
  description text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  git_tag text,
  sha text,
  milestone_id uuid REFERENCES milestones(id) ON DELETE SET NULL,
  released_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS release_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  payload_json text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repositories_workspace_id_idx ON repositories(workspace_id);
CREATE INDEX IF NOT EXISTS commits_repository_id_idx ON commits(repository_id);
CREATE INDEX IF NOT EXISTS pull_requests_repository_id_idx ON pull_requests(repository_id);
CREATE INDEX IF NOT EXISTS path_component_rules_workspace_id_idx ON path_component_rules(workspace_id);
CREATE INDEX IF NOT EXISTS path_component_rules_component_id_idx ON path_component_rules(component_id);
CREATE INDEX IF NOT EXISTS runs_pull_request_id_idx ON runs(pull_request_id);
CREATE INDEX IF NOT EXISTS runs_commit_id_idx ON runs(commit_id);
CREATE INDEX IF NOT EXISTS implementation_stats_implementation_id_idx ON implementation_stats(implementation_id);
CREATE INDEX IF NOT EXISTS failure_signatures_workspace_id_idx ON failure_signatures(workspace_id);
CREATE INDEX IF NOT EXISTS triage_items_signature_id_idx ON triage_items(signature_id);
CREATE INDEX IF NOT EXISTS journeys_workspace_id_idx ON journeys(workspace_id);
CREATE INDEX IF NOT EXISTS releases_workspace_id_idx ON releases(workspace_id);
CREATE INDEX IF NOT EXISTS releases_milestone_id_idx ON releases(milestone_id);
CREATE INDEX IF NOT EXISTS release_snapshots_release_id_idx ON release_snapshots(release_id);
