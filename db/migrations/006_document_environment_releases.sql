-- Folder-level environment release only gates the folder itself — every
-- document inside an already-released folder is immediately live wherever
-- the folder is, including one uploaded after that release happened. Add
-- the same release/revoke mechanism one level down, at the document level,
-- so a newly uploaded document requires its own explicit promotion. A chunk
-- is only eligible in a given environment when BOTH its folder and its
-- document have an active release there (enforced in application code, see
-- lib/search/retrieval-engine.ts).
--
-- Documents are not version-pinned, same reasoning as folder_environment_releases.
CREATE TABLE IF NOT EXISTS public.document_environment_releases (
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES public.target_app_environments(id) ON DELETE RESTRICT,
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (document_id, environment_id)
);

CREATE INDEX IF NOT EXISTS document_environment_releases_active_idx
  ON public.document_environment_releases (document_id, environment_id)
  WHERE deleted_at IS NULL;

-- One-time cutover: grandfather in every existing document as already
-- released everywhere its folder is currently released, so shipping this
-- feature doesn't instantly un-release everything that's already live.
-- Only documents created after this migration start unreleased-by-default.
INSERT INTO public.document_environment_releases (document_id, environment_id)
SELECT documents.id, folder_environment_releases.environment_id
FROM public.documents
INNER JOIN public.folder_environment_releases
  ON folder_environment_releases.folder_id = documents.folder_id
  AND folder_environment_releases.deleted_at IS NULL
WHERE documents.status <> 'deleted'
ON CONFLICT (document_id, environment_id) DO NOTHING;

-- The folder-level "Chatbot Access" feature (restricting a folder's
-- documents to specific roles/users) never actually gated the chatbot — the
-- live chat retrieval path (lib/search/retrieval-engine.ts) never enforces
-- document/role permissions at all. It only affected the two internal admin
-- test-search tools (/search/vector, /search/keyword), via
-- lib/search/vector-search.ts's documentPermissionClause. Removed as
-- confusing/misleading; per-document access (document_role_permissions /
-- document_user_permissions) is unrelated and remains.
DROP TABLE IF EXISTS public.folder_document_role_permissions;
DROP TABLE IF EXISTS public.folder_document_user_permissions;

-- Folders were originally called "topics" in the schema. Rename these two
-- tables and their topic_id column to match current terminology (folders),
-- consistent with folder_target_apps / folder_environment_releases /
-- folder_document_* naming used everywhere else.
ALTER TABLE public.role_topic_permissions RENAME TO folder_role_permissions;
ALTER TABLE public.user_topic_permissions RENAME TO folder_user_permissions;

ALTER TABLE public.folder_role_permissions RENAME COLUMN topic_id TO folder_id;
ALTER TABLE public.folder_user_permissions RENAME COLUMN topic_id TO folder_id;

ALTER TABLE public.folder_role_permissions RENAME CONSTRAINT role_topic_permissions_pkey TO folder_role_permissions_pkey;
ALTER TABLE public.folder_role_permissions RENAME CONSTRAINT role_topic_permissions_created_by_fkey TO folder_role_permissions_created_by_fkey;
ALTER TABLE public.folder_role_permissions RENAME CONSTRAINT role_topic_permissions_role_id_fkey TO folder_role_permissions_role_id_fkey;
ALTER TABLE public.folder_role_permissions RENAME CONSTRAINT role_topic_permissions_topic_id_fkey TO folder_role_permissions_folder_id_fkey;
ALTER TABLE public.folder_role_permissions RENAME CONSTRAINT role_topic_permissions_updated_by_fkey TO folder_role_permissions_updated_by_fkey;
ALTER INDEX public.role_topic_permissions_active_idx RENAME TO folder_role_permissions_active_idx;

ALTER TABLE public.folder_user_permissions RENAME CONSTRAINT user_topic_permissions_pkey TO folder_user_permissions_pkey;
ALTER TABLE public.folder_user_permissions RENAME CONSTRAINT user_topic_permissions_created_by_fkey TO folder_user_permissions_created_by_fkey;
ALTER TABLE public.folder_user_permissions RENAME CONSTRAINT user_topic_permissions_topic_id_fkey TO folder_user_permissions_folder_id_fkey;
ALTER TABLE public.folder_user_permissions RENAME CONSTRAINT user_topic_permissions_updated_by_fkey TO folder_user_permissions_updated_by_fkey;
ALTER TABLE public.folder_user_permissions RENAME CONSTRAINT user_topic_permissions_user_id_fkey TO folder_user_permissions_user_id_fkey;
ALTER INDEX public.user_topic_permissions_active_idx RENAME TO folder_user_permissions_active_idx;
