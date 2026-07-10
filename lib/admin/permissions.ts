import { redirect } from "next/navigation";
import type { Pool, PoolClient } from "pg";
import { getPool } from "@/lib/db/pool";
import type { AdminSession } from "./auth";

export const MODULE_KEYS = {
  overview: 1,
  administration: 2,
  userManagement: 3,
  contentStructure: 4,
  aiConfiguration: 5,
  guidedWorkflows: 6,
  workflowTrainingSetup: 7,
  workflowSelfHealingReview: 8,
  workflowAnalytics: 9,
  orchestrationDesigner: 10,
  emailCredentials: 11,
  companyRoleSetup: 12,
  triggersMonitoring: 13
} as const;

export type AdminModuleKey = number;

export type AdminModule = {
  key: AdminModuleKey;
  name: string;
  href: string;
  sortOrder: number;
  parentKey: number | null;
};

function normalizeModuleKeys(moduleKeys: Array<number | string>) {
  return Array.from(
    new Set(
      moduleKeys
        .map((moduleKey) => Number(moduleKey))
        .filter((moduleKey) => Number.isInteger(moduleKey) && moduleKey > 0)
    )
  );
}

function mapModules(rows: Array<{ key: number; name: string; href: string; sort_order: number; parent_key: number | null }>) {
  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    href: row.href,
    sortOrder: row.sort_order,
    parentKey: row.parent_key
  }));
}

export async function getAllAdminModules(): Promise<AdminModule[]> {
  const result = await getPool().query<{
    key: number;
    name: string;
    href: string;
    sort_order: number;
    parent_key: number | null;
  }>(
    `
      SELECT key, name, href, sort_order, parent_key
      FROM modules
      ORDER BY sort_order ASC, name ASC
    `
  );

  return mapModules(result.rows);
}

export async function getRoleModules(roleId: string): Promise<AdminModule[]> {
  const result = await getPool().query<{
    key: number;
    name: string;
    href: string;
    sort_order: number;
    parent_key: number | null;
  }>(
    `
      SELECT modules.key, modules.name, modules.href, modules.sort_order, modules.parent_key
      FROM role_module_permissions
      INNER JOIN modules ON modules.key = role_module_permissions.module_key
      WHERE role_module_permissions.role_id = $1
        AND role_module_permissions.deleted_at IS NULL
      ORDER BY modules.sort_order ASC, modules.name ASC
    `,
    [roleId]
  );

  return mapModules(result.rows);
}

export async function getEffectiveUserModules(
  userId: string,
  roleId: string,
  isAdminRole: boolean,
  companyId: string,
  client?: Pool | PoolClient
): Promise<AdminModule[]> {
  const db = client ?? getPool();
  const result = await db.query<{
    key: number;
    name: string;
    href: string;
    sort_order: number;
    parent_key: number | null;
  }>(
    `
      WITH role_modules AS (
        SELECT modules.key AS module_key, 'allow'::text AS effect
        FROM modules
        WHERE $4::boolean = true
        UNION ALL
        SELECT module_key, 'allow'::text AS effect
        FROM role_module_permissions
        WHERE $4::boolean = false
          AND role_id = $2
          AND deleted_at IS NULL
      ),
      merged_permissions AS (
        SELECT module_key, effect FROM role_modules
        UNION ALL
        SELECT module_key, effect
        FROM user_module_permissions
        WHERE user_id = $1
          AND company_id = $3
          AND deleted_at IS NULL
      ),
      effective_permissions AS (
        SELECT DISTINCT ON (module_key) module_key, effect
        FROM merged_permissions
        ORDER BY module_key, CASE WHEN effect = 'deny' THEN 2 ELSE 1 END DESC
      )
      SELECT modules.key, modules.name, modules.href, modules.sort_order, modules.parent_key
      FROM effective_permissions
      INNER JOIN modules ON modules.key = effective_permissions.module_key
      WHERE effective_permissions.effect = 'allow'
      ORDER BY modules.sort_order ASC, modules.name ASC
    `,
    [userId, roleId, companyId, isAdminRole]
  );

  return mapModules(result.rows);
}

export async function getUserModuleOverrides(userId: string, companyId: string) {
  const result = await getPool().query<{ module_key: number; effect: "allow" | "deny" }>(
    `
      SELECT module_key, effect
      FROM user_module_permissions
      WHERE user_id = $1 AND company_id = $2 AND deleted_at IS NULL
      ORDER BY module_key ASC
    `,
    [userId, companyId]
  );

  return result.rows;
}

export async function replaceUserModuleOverrides(
  userId: string,
  companyId: string,
  moduleKeys: Array<number | string>,
  updatedBy: string,
  client?: Pool | PoolClient
) {
  const keys = normalizeModuleKeys(moduleKeys);
  const db = client ?? getPool();

  await db.query(
    "UPDATE user_module_permissions SET deleted_at = now(), updated_by = $3, updated_at = now() WHERE user_id = $1 AND company_id = $2 AND deleted_at IS NULL",
    [userId, companyId, updatedBy]
  );

  await db.query(
    `
      INSERT INTO user_module_permissions (user_id, company_id, module_key, effect, created_by, updated_by)
      SELECT
        $1,
        $2,
        modules.key,
        CASE WHEN modules.key = ANY($3::integer[]) THEN 'allow' ELSE 'deny' END,
        $4,
        $4
      FROM modules
      WHERE modules.href <> '#'
      ON CONFLICT (user_id, company_id, module_key)
      DO UPDATE SET effect = EXCLUDED.effect, deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
    `,
    [userId, companyId, keys, updatedBy]
  );
}

export async function roleHasControlPanelAccess(roleId: string) {
  const modules = await getRoleModules(roleId);
  return modules.length > 0;
}

export async function grantDefaultAdminModules(roleId: string, client?: Pool | PoolClient) {
  const db = client ?? getPool();
  await db.query(
    `
      INSERT INTO role_module_permissions (role_id, module_key)
      SELECT $1, modules.key
      FROM modules
      ON CONFLICT (role_id, module_key)
      DO UPDATE SET deleted_at = NULL, updated_at = now()
    `,
    [roleId]
  );
}

export async function replaceRoleModulePermissions(roleId: string, moduleKeys: Array<number | string>, updatedBy: string) {
  const keys = normalizeModuleKeys(moduleKeys);

  await getPool().query(
    "UPDATE role_module_permissions SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE role_id = $1 AND deleted_at IS NULL",
    [roleId, updatedBy]
  );

  if (keys.length === 0) {
    return;
  }

  await getPool().query(
    `
      INSERT INTO role_module_permissions (role_id, module_key, created_by, updated_by)
      SELECT $1, module_key, $3, $3
      FROM unnest($2::integer[]) AS module_key
      ON CONFLICT (role_id, module_key)
      DO UPDATE SET deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
    `,
    [roleId, keys, updatedBy]
  );
}

export function hasModuleAccess(session: AdminSession, moduleKey: AdminModuleKey) {
  return session.modules.some((module) => module.key === moduleKey);
}

export function requireModuleAccess(session: AdminSession, moduleKey: AdminModuleKey) {
  if (!hasModuleAccess(session, moduleKey)) {
    redirect("/control-panel");
  }
}
