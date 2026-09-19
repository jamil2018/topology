-- Phase 7: workspace AI overrides + case activity provenance

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS ai_provider text,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_base_url text;

ALTER TABLE case_activities
  ADD COLUMN IF NOT EXISTS generated_by text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS approved_by_id uuid REFERENCES users(id) ON DELETE SET NULL;
