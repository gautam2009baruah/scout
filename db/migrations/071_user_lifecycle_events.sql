-- Migration 071: User lifecycle reasons and inactive status naming

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;

UPDATE users
SET status = 'inactive'
WHERE status = 'disabled';

ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'invited', 'inactive', 'deleted'));

CREATE TABLE IF NOT EXISTS user_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('inactivated', 'deleted')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_lifecycle_events_user
  ON user_lifecycle_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_lifecycle_events_company
  ON user_lifecycle_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_lifecycle_events_performed_by
  ON user_lifecycle_events(performed_by, created_at DESC);
