-- Phase 8: polymorphic comments + ownership on graph entities

CREATE TABLE IF NOT EXISTS entity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_comments_entity_idx
  ON entity_comments (workspace_id, entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS entity_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS entity_owners_user_idx
  ON entity_owners (workspace_id, user_id);

-- Saved views: allow intent presets
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'saved_view_entity' AND e.enumlabel = 'intents'
  ) THEN
    ALTER TYPE saved_view_entity ADD VALUE 'intents';
  END IF;
END $$;
