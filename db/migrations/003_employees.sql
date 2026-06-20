ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS can_view_chatbot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS users_company_employee_code_unique
  ON users (company_id, employee_code)
  WHERE employee_code IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS users_company_status_idx ON users (company_id, status);
CREATE INDEX IF NOT EXISTS users_company_email_idx ON users (company_id, lower(email));
CREATE INDEX IF NOT EXISTS users_company_name_idx ON users (company_id, lower(name));

CREATE TABLE IF NOT EXISTS employee_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_activation_tokens_user_id_idx
  ON employee_activation_tokens (user_id);

CREATE INDEX IF NOT EXISTS employee_activation_tokens_expires_at_idx
  ON employee_activation_tokens (expires_at);

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_outbox_status_created_at_idx
  ON email_outbox (status, created_at);
