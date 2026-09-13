-- Saved views (filter+sort presets) + case activity log
DO $$ BEGIN
  CREATE TYPE saved_view_entity AS ENUM ('cases', 'runs');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  entity saved_view_entity NOT NULL,
  config_json text NOT NULL,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_views_entity_idx ON saved_views (entity);
CREATE INDEX IF NOT EXISTS saved_views_created_by_idx ON saved_views (created_by_id);

CREATE TABLE IF NOT EXISTS case_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  field text,
  from_value text,
  to_value text,
  summary text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_activities_case_id_idx ON case_activities (case_id);
CREATE INDEX IF NOT EXISTS case_activities_created_at_idx ON case_activities (created_at DESC);
