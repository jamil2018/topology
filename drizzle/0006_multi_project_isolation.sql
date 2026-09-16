-- Multi-project isolation: workspace_id on domain tables + archive support

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS archived_at timestamp;

-- Ensure default workspace exists for backfill
INSERT INTO workspaces (id, name, slug, created_at, updated_at)
SELECT gen_random_uuid(), 'Topology', 'default', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = 'default');

ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE triage_items
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE linked_issues
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE saved_views
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE folders f
SET workspace_id = w.id
FROM workspaces w
WHERE f.workspace_id IS NULL AND w.slug = 'default';

UPDATE cases c
SET workspace_id = w.id
FROM workspaces w
WHERE c.workspace_id IS NULL AND w.slug = 'default';

UPDATE runs r
SET workspace_id = w.id
FROM workspaces w
WHERE r.workspace_id IS NULL AND w.slug = 'default';

UPDATE milestones m
SET workspace_id = w.id
FROM workspaces w
WHERE m.workspace_id IS NULL AND w.slug = 'default';

UPDATE triage_items t
SET workspace_id = w.id
FROM workspaces w
WHERE t.workspace_id IS NULL AND w.slug = 'default';

UPDATE linked_issues li
SET workspace_id = w.id
FROM workspaces w
WHERE li.workspace_id IS NULL AND w.slug = 'default';

UPDATE webhook_endpoints wh
SET workspace_id = w.id
FROM workspaces w
WHERE wh.workspace_id IS NULL AND w.slug = 'default';

UPDATE api_tokens at
SET workspace_id = w.id
FROM workspaces w
WHERE at.workspace_id IS NULL AND w.slug = 'default';

UPDATE saved_views sv
SET workspace_id = w.id
FROM workspaces w
WHERE sv.workspace_id IS NULL AND w.slug = 'default';

ALTER TABLE folders ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE cases ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE runs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE milestones ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE triage_items ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE linked_issues ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE api_tokens ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE saved_views ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS folders_workspace_id_idx ON folders(workspace_id);
CREATE INDEX IF NOT EXISTS cases_workspace_id_idx ON cases(workspace_id);
CREATE INDEX IF NOT EXISTS runs_workspace_id_idx ON runs(workspace_id);
CREATE INDEX IF NOT EXISTS milestones_workspace_id_idx ON milestones(workspace_id);
CREATE INDEX IF NOT EXISTS triage_items_workspace_id_idx ON triage_items(workspace_id);
CREATE INDEX IF NOT EXISTS linked_issues_workspace_id_idx ON linked_issues(workspace_id);
CREATE INDEX IF NOT EXISTS webhook_endpoints_workspace_id_idx ON webhook_endpoints(workspace_id);
CREATE INDEX IF NOT EXISTS api_tokens_workspace_id_idx ON api_tokens(workspace_id);
CREATE INDEX IF NOT EXISTS saved_views_workspace_id_idx ON saved_views(workspace_id);

-- Replace global unique case key with per-project uniqueness
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_key_unique;
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_key_key;
DO $$ BEGIN
  ALTER TABLE cases ADD CONSTRAINT cases_workspace_id_key_unique UNIQUE (workspace_id, key);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
