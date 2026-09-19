-- Phase 1: Quality graph + Test Intent

DO $$ BEGIN
  CREATE TYPE implementation_type AS ENUM (
    'manual', 'junit', 'playwright', 'api', 'unit', 'agent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quality_entity_type AS ENUM (
    'intent', 'requirement', 'risk', 'component', 'case', 'implementation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quality_relation AS ENUM (
    'covers', 'mitigates', 'belongs_to', 'implements'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS test_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  behavior text NOT NULL DEFAULT '',
  criticality case_priority NOT NULL DEFAULT 'P2',
  status case_status NOT NULL DEFAULT 'draft',
  folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS test_implementations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  intent_id uuid NOT NULL REFERENCES test_intents(id) ON DELETE CASCADE,
  type implementation_type NOT NULL,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  source_path text,
  external_key text,
  framework text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  criticality case_priority NOT NULL DEFAULT 'P2',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  criticality case_priority NOT NULL DEFAULT 'P2',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  criticality case_priority NOT NULL DEFAULT 'P2',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS quality_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_type quality_entity_type NOT NULL,
  from_id uuid NOT NULL,
  to_type quality_entity_type NOT NULL,
  to_id uuid NOT NULL,
  relation quality_relation NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, from_type, from_id, to_type, to_id, relation)
);

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS intent_id uuid REFERENCES test_intents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS test_intents_workspace_id_idx ON test_intents(workspace_id);
CREATE INDEX IF NOT EXISTS test_implementations_intent_id_idx ON test_implementations(intent_id);
CREATE INDEX IF NOT EXISTS test_implementations_case_id_idx ON test_implementations(case_id);
CREATE INDEX IF NOT EXISTS test_implementations_workspace_id_idx ON test_implementations(workspace_id);
CREATE INDEX IF NOT EXISTS requirements_workspace_id_idx ON requirements(workspace_id);
CREATE INDEX IF NOT EXISTS risks_workspace_id_idx ON risks(workspace_id);
CREATE INDEX IF NOT EXISTS components_workspace_id_idx ON components(workspace_id);
CREATE INDEX IF NOT EXISTS quality_edges_workspace_id_idx ON quality_edges(workspace_id);
CREATE INDEX IF NOT EXISTS cases_intent_id_idx ON cases(intent_id);

-- Backfill: each existing case → intent + manual/junit implementation
INSERT INTO test_intents (
  id, workspace_id, key, title, behavior, criticality, status,
  folder_id, assignee_id, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  c.workspace_id,
  c.key,
  c.title,
  CASE WHEN c.description <> '' THEN c.description ELSE c.title END,
  c.priority,
  c.status,
  c.folder_id,
  c.assignee_id,
  c.created_at,
  c.updated_at
FROM cases c
WHERE c.intent_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM test_intents i
    WHERE i.workspace_id = c.workspace_id AND i.key = c.key
  );

UPDATE cases c
SET intent_id = i.id
FROM test_intents i
WHERE c.intent_id IS NULL
  AND i.workspace_id = c.workspace_id
  AND i.key = c.key;

INSERT INTO test_implementations (
  id, workspace_id, intent_id, type, case_id, external_key, framework, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  c.workspace_id,
  c.intent_id,
  CASE
    WHEN c.key LIKE 'AUTO-%'
      OR 'junit' = ANY (c.tags)
      OR 'automation' = ANY (c.tags)
    THEN 'junit'::implementation_type
    ELSE 'manual'::implementation_type
  END,
  c.id,
  CASE
    WHEN c.key LIKE 'AUTO-%'
      OR 'junit' = ANY (c.tags)
      OR 'automation' = ANY (c.tags)
    THEN c.key
    ELSE NULL
  END,
  CASE
    WHEN c.key LIKE 'AUTO-%'
      OR 'junit' = ANY (c.tags)
      OR 'automation' = ANY (c.tags)
    THEN 'junit'
    ELSE NULL
  END,
  c.created_at,
  c.updated_at
FROM cases c
WHERE c.intent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM test_implementations ti
    WHERE ti.case_id = c.id
  );
