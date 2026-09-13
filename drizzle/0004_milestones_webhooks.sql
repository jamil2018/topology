-- Milestone readiness thresholds + outbound webhooks
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS min_executed_pct integer NOT NULL DEFAULT 80;

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS max_open_blockers integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  secret text NOT NULL DEFAULT '',
  events text NOT NULL DEFAULT 'run.completed,issue.created',
  enabled integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  last_delivered_at timestamp,
  last_status integer
);
