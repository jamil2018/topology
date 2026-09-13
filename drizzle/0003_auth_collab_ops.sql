-- Workspace collaboration, assignees, result comments, attachments

DO $$ BEGIN
  CREATE TYPE workspace_role AS ENUM ('admin', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'member',
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role workspace_role NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE,
  status invite_status NOT NULL DEFAULT 'pending',
  invited_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  accepted_at timestamp
);

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE run_results
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS result_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES run_results(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid REFERENCES run_results(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES result_comments(id) ON DELETE SET NULL,
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes integer NOT NULL,
  storage_key text NOT NULL UNIQUE,
  uploaded_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS result_comments_result_id_idx ON result_comments(result_id);
CREATE INDEX IF NOT EXISTS attachments_result_id_idx ON attachments(result_id);
CREATE INDEX IF NOT EXISTS workspace_invites_email_idx ON workspace_invites(email);
CREATE INDEX IF NOT EXISTS cases_assignee_id_idx ON cases(assignee_id);
CREATE INDEX IF NOT EXISTS runs_assignee_id_idx ON runs(assignee_id);
CREATE INDEX IF NOT EXISTS run_results_assignee_id_idx ON run_results(assignee_id);
