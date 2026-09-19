-- Phase 7: AI proposals + governance (review queue; never auto-write)

DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE proposal_actor_type AS ENUM ('user', 'agent', 'model');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  payload_json text NOT NULL,
  status proposal_status NOT NULL DEFAULT 'pending',
  actor_type proposal_actor_type NOT NULL DEFAULT 'agent',
  model text,
  input_refs text,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposals_workspace_status_idx
  ON proposals (workspace_id, status, created_at DESC);
