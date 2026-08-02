-- Environment-gated content releases + version-pinned promotion, merged from
-- what were originally four incremental migrations (environment release
-- tables, mandatory per-environment URLs, version-pinned promotion, and
-- MAJOR.BUILD versioning) into the single end state below, since none of
-- them have shipped to production yet.
--
-- Orchestrations, guided workflows, and RAG folders must be explicitly
-- released to an environment (reusing the existing chatbot_api_key_environments
-- list from Chatbot Settings) before they're eligible on the live,
-- API-key-authenticated chat path — publishing alone is not sufficient.
-- Revocation is per (content, environment) and does not affect other
-- environments the same content was released to.
--
-- For orchestrations and guided workflows, a release pins a specific
-- published MAJOR.BUILD version (e.g. 1.003), not just "the live content" —
-- editing and republishing only ever creates a new build; it never changes
-- what an already-promoted environment serves until that environment is
-- explicitly promoted again. BUILD increments on every publish. MAJOR only
-- advances the first time a given build is ever promoted to a
-- production-flagged environment (there can be several — Community,
-- Enterprise v1, Enterprise v2, ...) — a one-way ratchet stored on the
-- orchestration/guide itself (next_major/next_build), never derived from
-- whatever happens to be currently deployed anywhere. Promoting an
-- already-released build to another production environment, or demoting a
-- production environment back to an older already-released build, never
-- moves it. Folders/documents are not version-pinned — a folder release
-- still just gates the live content.

-- ============================================================================
-- Environment release tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orchestration_environment_releases (
  orchestration_id uuid NOT NULL REFERENCES public.orchestrations(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES public.chatbot_api_key_environments(id) ON DELETE RESTRICT,
  version_major integer NOT NULL,
  version_build integer NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (orchestration_id, environment_id)
);

CREATE INDEX IF NOT EXISTS orchestration_environment_releases_active_idx
  ON public.orchestration_environment_releases (orchestration_id, environment_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.guided_workflow_environment_releases (
  guide_id uuid NOT NULL REFERENCES public.guided_workflow_guides(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES public.chatbot_api_key_environments(id) ON DELETE RESTRICT,
  version_major integer NOT NULL,
  version_build integer NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (guide_id, environment_id)
);

CREATE INDEX IF NOT EXISTS guided_workflow_environment_releases_active_idx
  ON public.guided_workflow_environment_releases (guide_id, environment_id)
  WHERE deleted_at IS NULL;

-- Folders are not version-pinned — a release just gates the live content
-- (documents are individually replaced/embedded, not published as one unit).
CREATE TABLE IF NOT EXISTS public.folder_environment_releases (
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES public.chatbot_api_key_environments(id) ON DELETE RESTRICT,
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (folder_id, environment_id)
);

CREATE INDEX IF NOT EXISTS folder_environment_releases_active_idx
  ON public.folder_environment_releases (folder_id, environment_id)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- Environments: mandatory URL, production flag
-- ============================================================================

-- Environments gain a mandatory URL (test/staging/production point at
-- different hosts), replacing the single per-target-app base_url below.
ALTER TABLE public.chatbot_api_key_environments ADD COLUMN url text NOT NULL DEFAULT ''::text;
ALTER TABLE public.chatbot_api_key_environments ADD COLUMN is_production boolean NOT NULL DEFAULT false;

ALTER TABLE public.company_target_applications DROP COLUMN base_url;

-- ============================================================================
-- Guided workflow version snapshots (guides had no snapshot-on-publish
-- before this — every publish now records one)
-- ============================================================================

CREATE TABLE public.guided_workflow_guide_versions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    guide_id uuid NOT NULL REFERENCES public.guided_workflow_guides(id) ON DELETE CASCADE,
    version_major integer NOT NULL,
    version_build integer NOT NULL,
    steps_json jsonb NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    pre_workflow_confirmation_html text NOT NULL DEFAULT '',
    pre_workflow_confirmation_enabled boolean NOT NULL DEFAULT false,
    promoted_to_production boolean NOT NULL DEFAULT false,
    change_notes text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (guide_id, version_major, version_build)
);

-- Backfill v1 snapshots for guides already published, while
-- guided_workflow_guides.version (dropped further down) still exists.
INSERT INTO public.guided_workflow_guide_versions (guide_id, version_major, version_build, steps_json, title, description, pre_workflow_confirmation_html, pre_workflow_confirmation_enabled)
SELECT id, 1, version, steps_json, title, description, pre_workflow_confirmation_html, pre_workflow_confirmation_enabled
FROM public.guided_workflow_guides WHERE status = 'published';

-- ============================================================================
-- Orchestration version snapshots: MAJOR.BUILD
-- ============================================================================

ALTER TABLE public.orchestration_versions ADD COLUMN version_major integer;
ALTER TABLE public.orchestration_versions ADD COLUMN version_build integer;
ALTER TABLE public.orchestration_versions ADD COLUMN promoted_to_production boolean NOT NULL DEFAULT false;

UPDATE public.orchestration_versions SET version_major = 1, version_build = version;

ALTER TABLE public.orchestration_versions ALTER COLUMN version_major SET NOT NULL;
ALTER TABLE public.orchestration_versions ALTER COLUMN version_build SET NOT NULL;
ALTER TABLE public.orchestration_versions DROP CONSTRAINT orchestration_versions_unique;
ALTER TABLE public.orchestration_versions ADD CONSTRAINT orchestration_versions_unique UNIQUE (orchestration_id, version_major, version_build);
ALTER TABLE public.orchestration_versions DROP COLUMN version;

-- ============================================================================
-- orchestrations / guided_workflow_guides: MAJOR.BUILD ratchet
-- ============================================================================

ALTER TABLE public.orchestrations ADD COLUMN next_major integer NOT NULL DEFAULT 1;
ALTER TABLE public.orchestrations ADD COLUMN next_build integer NOT NULL DEFAULT 0;
ALTER TABLE public.orchestrations ADD COLUMN published_version_major integer NOT NULL DEFAULT 1;
ALTER TABLE public.orchestrations ADD COLUMN published_version_build integer NOT NULL DEFAULT 0;

UPDATE public.orchestrations
SET published_version_major = 1,
    published_version_build = version,
    next_major = 1,
    next_build = version + 1;

ALTER TABLE public.orchestrations DROP COLUMN version;

ALTER TABLE public.guided_workflow_guides ADD COLUMN next_major integer NOT NULL DEFAULT 1;
ALTER TABLE public.guided_workflow_guides ADD COLUMN next_build integer NOT NULL DEFAULT 0;
ALTER TABLE public.guided_workflow_guides ADD COLUMN published_version_major integer NOT NULL DEFAULT 1;
ALTER TABLE public.guided_workflow_guides ADD COLUMN published_version_build integer NOT NULL DEFAULT 0;

UPDATE public.guided_workflow_guides
SET published_version_major = 1,
    published_version_build = version,
    next_major = 1,
    next_build = version + 1;

ALTER TABLE public.guided_workflow_guides DROP COLUMN version;

-- ============================================================================
-- orchestration_executions: which build actually ran
-- ============================================================================

ALTER TABLE public.orchestration_executions ADD COLUMN orchestration_version_major integer;
ALTER TABLE public.orchestration_executions ADD COLUMN orchestration_version_build integer;
UPDATE public.orchestration_executions SET orchestration_version_major = 1, orchestration_version_build = orchestration_version;
ALTER TABLE public.orchestration_executions ALTER COLUMN orchestration_version_major SET NOT NULL;
ALTER TABLE public.orchestration_executions ALTER COLUMN orchestration_version_build SET NOT NULL;
ALTER TABLE public.orchestration_executions DROP COLUMN orchestration_version;

-- ============================================================================
-- Defensive: if either environment-release table already has active rows
-- pointing at a production-flagged environment by the time this runs (not
-- possible on a first-time deploy, since both tables are created above in
-- this same migration — kept only in case this ever runs against a
-- partially-seeded database), mark the corresponding build as already
-- promoted so a later re-promotion doesn't incorrectly bump the ratchet.
-- ============================================================================

UPDATE public.orchestration_versions ov
SET promoted_to_production = true
FROM public.orchestration_environment_releases oer
INNER JOIN public.chatbot_api_key_environments env ON env.id = oer.environment_id
WHERE oer.orchestration_id = ov.orchestration_id
  AND oer.version_major = ov.version_major
  AND oer.version_build = ov.version_build
  AND env.is_production = true
  AND oer.deleted_at IS NULL;

UPDATE public.guided_workflow_guide_versions gwv
SET promoted_to_production = true
FROM public.guided_workflow_environment_releases gwer
INNER JOIN public.chatbot_api_key_environments env ON env.id = gwer.environment_id
WHERE gwer.guide_id = gwv.guide_id
  AND gwer.version_major = gwv.version_major
  AND gwer.version_build = gwv.version_build
  AND env.is_production = true
  AND gwer.deleted_at IS NULL;
