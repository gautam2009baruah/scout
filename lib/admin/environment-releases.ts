// Shared logic for environment-gated content releases (orchestrations, guided
// workflow guides, RAG folders) — reuses the environment list already managed
// under Chatbot Settings (target_app_environments). See
// db/migrations/002_environment_releases.sql for the three release tables.
//
// Publishing content is not sufficient on its own for it to be eligible on
// the live, API-key-authenticated chat path — it must also be explicitly
// released to at least one environment here.

import { getPool } from "@/lib/db/pool";

export type ContentEnvironmentReleaseKind = "orchestration" | "guided_workflow" | "folder";

const RELEASE_TABLE: Record<ContentEnvironmentReleaseKind, { table: string; column: string }> = {
  orchestration: { table: "orchestration_environment_releases", column: "orchestration_id" },
  guided_workflow: { table: "guided_workflow_environment_releases", column: "guide_id" },
  folder: { table: "folder_environment_releases", column: "folder_id" },
};

export type EnvironmentOption = {
  id: string;
  name: string;
};

export async function listEnvironmentsForTargetApp(targetAppId: string): Promise<EnvironmentOption[]> {
  const result = await getPool().query<{ id: string; name: string }>(
    `SELECT id, name FROM target_app_environments WHERE target_app_id = $1 ORDER BY name ASC`,
    [targetAppId]
  );

  return result.rows;
}

export async function getReleasedEnvironmentIds(
  kind: ContentEnvironmentReleaseKind,
  contentId: string
): Promise<string[]> {
  const { table, column } = RELEASE_TABLE[kind];
  const result = await getPool().query<{ environment_id: string }>(
    `SELECT environment_id FROM ${table} WHERE ${column} = $1 AND deleted_at IS NULL`,
    [contentId]
  );

  return result.rows.map((row) => row.environment_id);
}

// Replaces the released-environment set for a content item within a scope,
// in one transaction: revokes (soft-delete) anything within visibleEnvironmentIds
// that's no longer selected, and releases (upsert, clearing any prior revoke)
// everything in selectedEnvironmentIds. Releases to environments outside
// visibleEnvironmentIds are left untouched — this matters for folders, which
// (unlike orchestrations/guides) can be scoped to multiple target apps at
// once: editing one target app's environment checklist must never revoke a
// release that belongs to a different target app's environment list.
// visibleEnvironmentIds should be every environment id the admin could have
// seen/checked in this edit session (typically all of listEnvironmentsForTargetApp
// for the target app being edited) — pass the full list, not just the selection.
export async function replaceEnvironmentReleases(
  kind: ContentEnvironmentReleaseKind,
  contentId: string,
  selectedEnvironmentIds: string[],
  visibleEnvironmentIds: string[],
  actorUserId: string
): Promise<string[]> {
  const { table, column } = RELEASE_TABLE[kind];
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE ${table}
       SET deleted_at = now(), deleted_by = $2
       WHERE ${column} = $1 AND deleted_at IS NULL
         AND environment_id = ANY($3::uuid[]) AND environment_id <> ALL($4::uuid[])`,
      [contentId, actorUserId, visibleEnvironmentIds, selectedEnvironmentIds]
    );

    for (const environmentId of selectedEnvironmentIds) {
      await client.query(
        `INSERT INTO ${table} (${column}, environment_id, released_at, released_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (${column}, environment_id) DO UPDATE
         SET deleted_at = NULL, deleted_by = NULL, released_at = now(), released_by = $3`,
        [contentId, environmentId, actorUserId]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getReleasedEnvironmentIds(kind, contentId);
}
