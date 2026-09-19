-- Phase 3: persist changed file paths on commits and pull requests

ALTER TABLE commits
  ADD COLUMN IF NOT EXISTS changed_paths_json text NOT NULL DEFAULT '[]';

ALTER TABLE pull_requests
  ADD COLUMN IF NOT EXISTS changed_paths_json text NOT NULL DEFAULT '[]';
