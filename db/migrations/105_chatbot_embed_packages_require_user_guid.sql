ALTER TABLE chatbot_embed_packages
  ADD COLUMN IF NOT EXISTS require_user_guid boolean NOT NULL DEFAULT false;
