import { getPool } from "@/lib/db/pool";
import { MODULE_KEYS, grantDefaultAdminModules, hasModuleAccess, replaceRoleModulePermissions } from "./permissions";
import type { AdminSession } from "./auth";

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  roleCount: number;
  userCount: number;
  createdAt: Date;
};

export type RoleSummary = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  isAdminRole: boolean;
  moduleKeys: number[];
  createdAt: Date;
};

export type CreateCompanyInput = {
  name: string;
  slug?: string;
};

export type UpdateCompanyInput = CreateCompanyInput;

export type CreateRoleInput = {
  companyId?: string;
  companyIds?: string[];
  name: string;
  isAdminRole?: boolean;
  description?: string;
  moduleKeys?: Array<number | string>;
};

export type UpdateRoleInput = Omit<CreateRoleInput, "companyId">;

export class MasterDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterDataError";
  }
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertCanManageMasterData(session: AdminSession) {
  if (!hasModuleAccess(session, MODULE_KEYS.administration)) {
    throw new MasterDataError("You do not have permission to manage master data.");
  }
}

export async function getMasterData() {
  const pool = getPool();
  const [companiesResult, rolesResult] = await Promise.all([
    pool.query<{
      id: string;
      name: string;
      slug: string;
      status: string;
      role_count: string;
      user_count: string;
      created_at: Date;
    }>(
      `
        SELECT
          companies.id,
          companies.name,
          companies.slug,
          companies.status,
          companies.created_at,
          COUNT(DISTINCT roles.id) FILTER (WHERE roles.company_id IS NOT NULL) AS role_count,
          COALESCE(company_users.user_count, 0) AS user_count
        FROM companies
        LEFT JOIN roles ON roles.company_id = companies.id AND roles.deleted_at IS NULL
        LEFT JOIN LATERAL (
          SELECT COUNT(DISTINCT users.id) AS user_count
          FROM users
          WHERE users.deleted_at IS NULL
            AND (
              users.company_id = companies.id
              OR EXISTS (
                SELECT 1
                FROM user_company_roles
                WHERE user_company_roles.user_id = users.id
                  AND user_company_roles.company_id = companies.id
                  AND user_company_roles.deleted_at IS NULL
              )
            )
        ) company_users ON true
        WHERE companies.deleted_at IS NULL
        GROUP BY companies.id, company_users.user_count
        ORDER BY companies.created_at DESC
      `
    ),
    pool.query<{
      id: string;
      company_id: string | null;
      company_name: string | null;
      name: string;
      description: string | null;
      is_system: boolean;
      is_admin_role: boolean;
      module_keys: number[] | null;
      created_at: Date;
    }>(
      `
        SELECT
          roles.id,
          roles.company_id,
          companies.name AS company_name,
          roles.name,
          roles.description,
          roles.is_system,
          roles.is_admin_role,
          CASE
            WHEN roles.is_admin_role = true THEN all_modules.module_keys
            ELSE COALESCE(module_access.module_keys, ARRAY[]::integer[])
          END AS module_keys,
          roles.created_at
        FROM roles
        LEFT JOIN companies ON companies.id = roles.company_id
        CROSS JOIN (
          SELECT array_agg(key ORDER BY sort_order, name) AS module_keys
          FROM modules
        ) all_modules
        LEFT JOIN LATERAL (
          SELECT array_agg(modules.key ORDER BY modules.sort_order, modules.name) AS module_keys
          FROM role_module_permissions
          INNER JOIN modules ON modules.key = role_module_permissions.module_key
          WHERE role_module_permissions.role_id = roles.id
            AND role_module_permissions.deleted_at IS NULL
        ) module_access ON true
        WHERE roles.deleted_at IS NULL
        ORDER BY roles.is_system DESC, companies.name ASC NULLS FIRST, roles.name ASC
      `
    )
  ]);

  return {
    companies: companiesResult.rows.map((company): CompanySummary => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      status: company.status,
      roleCount: Number(company.role_count),
      userCount: Number(company.user_count),
      createdAt: company.created_at
    })),
    roles: rolesResult.rows.map((role): RoleSummary => ({
      id: role.id,
      companyId: role.company_id,
      companyName: role.company_name,
      name: role.name,
      description: role.description,
      isSystem: role.is_system,
      isAdminRole: role.is_admin_role,
      moduleKeys: role.module_keys ?? [],
      createdAt: role.created_at
    }))
  };
}

export async function createCompany(input: CreateCompanyInput, session: AdminSession) {
  assertCanManageMasterData(session);

  const name = input.name.trim();
  const slug = normalizeKey(input.slug || input.name);

  if (!name || !slug) {
    throw new MasterDataError("Company name is required.");
  }

  try {
    const result = await getPool().query<CompanySummary>(
      `
        INSERT INTO companies (name, slug, created_by, updated_by)
        VALUES ($1, $2, $3, $3)
        RETURNING id, name, slug, status, created_at AS "createdAt"
      `,
      [name, slug, session.user.id]
    );

    return result.rows[0];
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new MasterDataError("A company with this slug already exists.");
    }

    throw error;
  }
}

export async function updateCompany(companyId: string, input: UpdateCompanyInput, session: AdminSession) {
  assertCanManageMasterData(session);

  const name = input.name.trim();
  const slug = normalizeKey(input.slug || input.name);

  if (!companyId || !name || !slug) {
    throw new MasterDataError("Company name is required.");
  }

  try {
    const result = await getPool().query<CompanySummary>(
      `
        UPDATE companies
        SET name = $2, slug = $3, updated_by = $4, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name, slug, status, created_at AS "createdAt"
      `,
      [companyId, name, slug, session.user.id]
    );

    if (result.rowCount !== 1) {
      throw new MasterDataError("Company was not found.");
    }

    return result.rows[0];
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new MasterDataError("A company with this slug already exists.");
    }

    throw error;
  }
}

export async function deleteCompany(companyId: string, session: AdminSession) {
  assertCanManageMasterData(session);

  if (!companyId) {
    throw new MasterDataError("Company is required.");
  }

  const usageResult = await getPool().query<{
    user_count: string;
    role_count: string;
  }>(
    `
      SELECT
        COUNT(DISTINCT users.id) AS user_count,
        COUNT(DISTINCT roles.id) FILTER (WHERE roles.company_id IS NOT NULL) AS role_count
      FROM companies
      LEFT JOIN users ON users.company_id = companies.id AND users.deleted_at IS NULL
      LEFT JOIN roles ON roles.company_id = companies.id AND roles.deleted_at IS NULL
      WHERE companies.id = $1 AND companies.deleted_at IS NULL
      GROUP BY companies.id
    `,
    [companyId]
  );

  const usage = usageResult.rows[0];

  if (!usage) {
    throw new MasterDataError("Company was not found.");
  }

  if (Number(usage.user_count) > 0) {
    throw new MasterDataError("Delete users for this company before deleting the company.");
  }

  await getPool().query(
    "UPDATE companies SET status = 'archived', deleted_at = now(), updated_by = $2, updated_at = now() WHERE id = $1 AND deleted_at IS NULL",
    [companyId, session.user.id]
  );
}

export async function createRole(input: CreateRoleInput, session: AdminSession) {
  assertCanManageMasterData(session);

  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const isAdminRole = input.isAdminRole === true;

  const companyIds = input.companyIds?.length ? input.companyIds : input.companyId ? [input.companyId] : [];

  if (companyIds.length === 0 || !name) {
    throw new MasterDataError("Company and role name are required.");
  }

  try {
    const createdRoles: RoleSummary[] = [];

    for (const companyId of companyIds) {
      const result = await getPool().query<RoleSummary>(
        `
          INSERT INTO roles (company_id, name, description, is_admin_role, created_by, updated_by)
          VALUES ($1, $2, $3, $4, $5, $5)
          RETURNING
            id,
            company_id AS "companyId",
            name,
            description,
            is_system AS "isSystem",
            is_admin_role AS "isAdminRole",
            created_at AS "createdAt"
        `,
        [companyId, name, description, isAdminRole, session.user.id]
      );

      const role = result.rows[0];
      if (isAdminRole) {
        await grantDefaultAdminModules(role.id);
      } else {
        await replaceRoleModulePermissions(role.id, input.moduleKeys ?? [], session.user.id);
      }

      createdRoles.push(role);
    }

    return createdRoles[0];
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new MasterDataError("This role already exists for the selected company.");
    }

    throw error;
  }
}

export async function updateRole(roleId: string, input: UpdateRoleInput, session: AdminSession) {
  assertCanManageMasterData(session);

  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const isAdminRole = input.isAdminRole === true;

  if (!roleId || !name) {
    throw new MasterDataError("Role name is required.");
  }

  try {
    const result = await getPool().query<RoleSummary>(
      `
        UPDATE roles
        SET name = $2, description = $3, is_admin_role = $4, updated_by = $5, updated_at = now()
        WHERE id = $1 AND is_system = false AND deleted_at IS NULL
        RETURNING
          id,
          company_id AS "companyId",
          name,
          description,
          is_system AS "isSystem",
          is_admin_role AS "isAdminRole",
          created_at AS "createdAt"
      `,
      [roleId, name, description, isAdminRole, session.user.id]
    );

    if (result.rowCount !== 1) {
      throw new MasterDataError("Role was not found or cannot be edited.");
    }

    const role = result.rows[0];
    if (isAdminRole) {
      await grantDefaultAdminModules(role.id);
    } else {
      await replaceRoleModulePermissions(role.id, input.moduleKeys ?? [], session.user.id);
    }

    return role;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new MasterDataError("This role already exists for the selected company.");
    }

    throw error;
  }
}

export async function deleteRole(roleId: string, session: AdminSession) {
  assertCanManageMasterData(session);

  if (!roleId) {
    throw new MasterDataError("Role is required.");
  }

  const usageResult = await getPool().query<{
    is_system: boolean;
    user_count: string;
  }>(
    `
      SELECT
        roles.is_system,
        (
          SELECT COUNT(DISTINCT assigned_users.user_id)
          FROM (
            SELECT users.id AS user_id
            FROM users
            WHERE users.role_id = roles.id
              AND users.deleted_at IS NULL
            UNION
            SELECT user_company_roles.user_id
            FROM user_company_roles
            INNER JOIN users ON users.id = user_company_roles.user_id
            WHERE user_company_roles.role_id = roles.id
              AND user_company_roles.deleted_at IS NULL
              AND users.deleted_at IS NULL
          ) assigned_users
        ) AS user_count
      FROM roles
      WHERE roles.id = $1 AND roles.deleted_at IS NULL
      GROUP BY roles.id
    `,
    [roleId]
  );

  const usage = usageResult.rows[0];

  if (!usage) {
    throw new MasterDataError("Role was not found.");
  }

  if (usage.is_system) {
    throw new MasterDataError("System roles cannot be deleted.");
  }

  if (Number(usage.user_count) > 0) {
    throw new MasterDataError("This role is assigned to users and cannot be deleted.");
  }

  await getPool().query(
    "UPDATE roles SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE id = $1 AND deleted_at IS NULL",
    [roleId, session.user.id]
  );
}
