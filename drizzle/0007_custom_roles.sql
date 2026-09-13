-- Custom action-based roles per project (workspace)

CREATE TABLE IF NOT EXISTS workspace_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  actions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  system_key workspace_role,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name),
  UNIQUE (workspace_id, system_key)
);

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES workspace_roles(id) ON DELETE SET NULL;

ALTER TABLE workspace_invites
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES workspace_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workspace_roles_workspace_id_idx ON workspace_roles(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_custom_role_id_idx ON workspace_members(custom_role_id);
CREATE INDEX IF NOT EXISTS workspace_invites_custom_role_id_idx ON workspace_invites(custom_role_id);

-- Seed system roles for every existing project
INSERT INTO workspace_roles (workspace_id, name, description, actions, is_system, system_key)
SELECT
  w.id,
  'Admin',
  'Full project access, including members and roles.',
  ARRAY[
    'cases.view','cases.create','cases.edit','cases.delete',
    'runs.view','runs.create','runs.edit','runs.delete','runs.complete',
    'reports.view','reports.create',
    'automation.view','automation.manage',
    'milestones.view','milestones.manage',
    'triage.manage','folders.manage',
    'settings.view','webhooks.manage','project.manage','members.invite','roles.manage'
  ]::text[],
  true,
  'admin'::workspace_role
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_roles r
  WHERE r.workspace_id = w.id AND r.system_key = 'admin'
);

INSERT INTO workspace_roles (workspace_id, name, description, actions, is_system, system_key)
SELECT
  w.id,
  'Member',
  'Create and edit cases, runs, and related project data.',
  ARRAY[
    'cases.view','cases.create','cases.edit','cases.delete',
    'runs.view','runs.create','runs.edit','runs.delete','runs.complete',
    'reports.view','reports.create',
    'automation.view','automation.manage',
    'milestones.view','milestones.manage',
    'triage.manage','folders.manage',
    'settings.view'
  ]::text[],
  true,
  'member'::workspace_role
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_roles r
  WHERE r.workspace_id = w.id AND r.system_key = 'member'
);

INSERT INTO workspace_roles (workspace_id, name, description, actions, is_system, system_key)
SELECT
  w.id,
  'Viewer',
  'Read-only access to cases, runs, and reports.',
  ARRAY[
    'cases.view','runs.view','reports.view','automation.view','milestones.view','settings.view'
  ]::text[],
  true,
  'viewer'::workspace_role
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_roles r
  WHERE r.workspace_id = w.id AND r.system_key = 'viewer'
);

-- Point existing memberships at the matching system role
UPDATE workspace_members m
SET custom_role_id = r.id
FROM workspace_roles r
WHERE m.custom_role_id IS NULL
  AND r.workspace_id = m.workspace_id
  AND r.system_key = m.role;

UPDATE workspace_invites i
SET custom_role_id = r.id
FROM workspace_roles r
WHERE i.custom_role_id IS NULL
  AND r.workspace_id = i.workspace_id
  AND r.system_key = i.role;
