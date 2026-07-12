import { createHash } from "crypto";
import { getPool } from "@/lib/db/pool";
import type { AdminSession } from "./auth";
import { sendEmail } from "./email";
import { hashPassword } from "./password";
import { MODULE_KEYS, getEffectiveUserModules, hasModuleAccess, replaceUserModuleOverrides } from "./permissions";

export type EmployeeStatus = "active" | "invited" | "inactive" | "disabled" | "deleted";

export type EmployeeMembership = {
  companyId: string;
  roleId: string;
  roleName: string;
  status: "active" | "inactive";
  moduleKeys: number[];
  targetAppIds: string[];
  isPrimary: boolean;
};

export type EmployeeRow = {
  id: string;
  companyId: string;
  companyIds: string[];
  companyName: string;
  companyNames: string[];
  roleId: string;
  roleName: string;
  memberships: EmployeeMembership[];
  name: string;
  email: string;
  employeeCode: string | null;
  hasSystemRole: boolean;
  status: EmployeeStatus;
  canViewChatbot: boolean;
  moduleKeys: number[];
  activatedAt: Date | null;
  invitedAt: Date | null;
  createdAt: Date;
};

export type EmployeeFilters = {
  companyId?: string;
  roleId?: string;
  status?: string;
  search?: string;
  page: number;
  pageSize: number;
};

export type RegisterEmployeeInput = {
  companyId: string;
  companyIds?: string[];
  roleId: string;
  name: string;
  email: string;
  employeeCode?: string;
  moduleKeys?: Array<number | string>;
  targetAppIds?: string[];
};

export type UpdateEmployeeInput = RegisterEmployeeInput & {
  status: EmployeeStatus;
  statusReason?: string;
};

export class EmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeError";
  }
}

function assertCanManageUsers(session: AdminSession) {
  if (!hasModuleAccess(session, MODULE_KEYS.userManagement)) {
    throw new EmployeeError("You do not have permission to manage users.");
  }
}

function normalizeEmployeeStatus(status: EmployeeStatus): Exclude<EmployeeStatus, "disabled"> {
  return status === "disabled" ? "inactive" : status;
}

function assertCanAccessCompany(companyId: string, session: AdminSession) {
  if (!session.availableCompanies.some((company) => company.companyId === companyId)) {
    throw new EmployeeError("You do not have access to this company.");
  }
}

function requireReason(reason: string | undefined, action: string) {
  const trimmed = reason?.trim() ?? "";

  if (!trimmed) {
    throw new EmployeeError(`Reason is required when ${action}.`);
  }

  return trimmed;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function mapEmployee(row: {
  id: string;
  company_id: string;
  company_ids: string[] | null;
  company_name: string;
  company_names: string[] | null;
  role_id: string;
  role_name: string;
  memberships: EmployeeMembership[] | null;
  name: string;
  email: string;
  employee_code: string | null;
  has_system_role: boolean;
  status: EmployeeStatus;
  can_view_chatbot: boolean;
  module_keys: number[] | null;
  activated_at: Date | null;
  invited_at: Date | null;
  created_at: Date;
}): EmployeeRow {
  return {
    id: row.id,
    companyId: row.company_id,
    companyIds: row.company_ids?.length ? row.company_ids : [row.company_id],
    companyName: row.company_name,
    companyNames: row.company_names?.length ? row.company_names : [row.company_name],
    roleId: row.role_id,
    roleName: row.role_name,
    memberships: row.memberships ?? [],
    name: row.name,
    email: row.email,
    employeeCode: row.employee_code,
    hasSystemRole: row.has_system_role,
    status: row.status,
    canViewChatbot: row.can_view_chatbot,
    moduleKeys: row.module_keys ?? [],
    activatedAt: row.activated_at,
    invitedAt: row.invited_at,
    createdAt: row.created_at
  };
}

async function getRoleTemplate(roleId: string) {
  const result = await getPool().query<{ name: string; is_admin_role: boolean; is_system: boolean }>(
    "SELECT name, is_admin_role, is_system FROM roles WHERE id = $1 AND deleted_at IS NULL",
    [roleId]
  );
  return result.rows[0] ?? null;
}

async function getCompanyRoleIds(companyIds: string[], roleName: string) {
  if (!roleName) {
    throw new EmployeeError("Role is required.");
  }

  const result = await getPool().query<{ company_id: string; role_id: string }>(
    `
      SELECT company_id, id AS role_id
      FROM roles
      WHERE company_id = ANY($1::uuid[])
        AND lower(name) = lower($2)
        AND is_system = false
        AND deleted_at IS NULL
    `,
    [companyIds, roleName]
  );

  const roleByCompany = new Map(result.rows.map((row) => [row.company_id, row]));

  if (roleByCompany.size !== companyIds.length) {
    throw new EmployeeError("The selected role must exist for every selected company.");
  }

  return companyIds.map((companyId) => roleByCompany.get(companyId)).filter((row): row is { company_id: string; role_id: string } => Boolean(row));
}

async function assertUserIsEditable(userId: string) {
  const result = await getPool().query<{ has_system_role: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM user_company_roles
        INNER JOIN roles ON roles.id = user_company_roles.role_id
        WHERE user_company_roles.user_id = $1
          AND user_company_roles.deleted_at IS NULL
          AND roles.deleted_at IS NULL
          AND roles.is_system = true
      ) AS has_system_role
    `,
    [userId]
  );

  if (result.rows[0]?.has_system_role) {
    throw new EmployeeError("Users assigned to system roles cannot be edited or deleted.");
  }
}

export async function getEmployeePage(filters: EmployeeFilters) {
  const page = Math.max(filters.page, 1);
  const pageSize = Math.min(Math.max(filters.pageSize, 5), 100);
  const offset = (page - 1) * pageSize;
  const search = filters.search?.trim() || null;

  const params = [
    filters.companyId || null,
    filters.roleId || null,
    filters.status || null,
    search ? `%${search.toLowerCase()}%` : null,
    pageSize,
    offset
  ];

  const where = `
    users.deleted_at IS NULL
    AND user_company_roles.deleted_at IS NULL
    AND companies.deleted_at IS NULL
    AND roles.deleted_at IS NULL
    AND user_company_roles.company_id = $1::uuid
    AND ($2::uuid IS NULL OR user_company_roles.role_id = $2)
    AND (
      $3::text IS NULL
      OR CASE
        WHEN users.status = 'invited' THEN 'invited'
        ELSE user_company_roles.status
      END = CASE WHEN $3 = 'disabled' THEN 'inactive' ELSE $3 END
    )
    AND (
      $4::text IS NULL
      OR lower(users.name) LIKE $4
      OR lower(users.email) LIKE $4
      OR lower(coalesce(users.employee_code, '')) LIKE $4
    )
  `;

  const [rowsResult, countResult] = await Promise.all([
    getPool().query<{
      id: string;
      company_id: string;
      company_ids: string[] | null;
      company_name: string;
      company_names: string[] | null;
      role_id: string;
      role_name: string;
      memberships: EmployeeMembership[] | null;
      name: string;
      email: string;
      employee_code: string | null;
      has_system_role: boolean;
      status: EmployeeStatus;
      can_view_chatbot: boolean;
  module_keys: number[] | null;
      activated_at: Date | null;
      invited_at: Date | null;
      created_at: Date;
    }>(
      `
        SELECT
          users.id,
          user_company_roles.company_id,
          COALESCE(company_memberships.company_ids, ARRAY[user_company_roles.company_id]) AS company_ids,
          companies.name AS company_name,
          COALESCE(company_memberships.company_names, ARRAY[companies.name]) AS company_names,
          user_company_roles.role_id,
          roles.name AS role_name,
          COALESCE(membership_details.memberships, '[]'::jsonb) AS memberships,
          users.name,
          users.email,
          users.employee_code,
          COALESCE(system_role_access.has_system_role, false) AS has_system_role,
          CASE
            WHEN users.status = 'invited' THEN 'invited'
            ELSE user_company_roles.status
          END AS status,
          users.can_view_chatbot,
          COALESCE(module_access.module_keys, ARRAY[]::integer[]) AS module_keys,
          users.activated_at,
          users.invited_at,
          users.created_at
        FROM users
        INNER JOIN user_company_roles ON user_company_roles.user_id = users.id
        INNER JOIN companies ON companies.id = user_company_roles.company_id
        INNER JOIN roles ON roles.id = user_company_roles.role_id
        LEFT JOIN LATERAL (
          SELECT
            array_agg(member_companies.id ORDER BY member_companies.name) AS company_ids,
            array_agg(member_companies.name ORDER BY member_companies.name) AS company_names
          FROM user_company_roles
          INNER JOIN companies member_companies ON member_companies.id = user_company_roles.company_id
          WHERE user_company_roles.user_id = users.id
            AND user_company_roles.deleted_at IS NULL
            AND member_companies.deleted_at IS NULL
        ) company_memberships ON true
        LEFT JOIN LATERAL (
          SELECT bool_or(member_roles.is_system) AS has_system_role
          FROM user_company_roles member_ucr
          INNER JOIN roles member_roles ON member_roles.id = member_ucr.role_id
          WHERE member_ucr.user_id = users.id
            AND member_ucr.deleted_at IS NULL
            AND member_roles.deleted_at IS NULL
        ) system_role_access ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'companyId', member_roles.company_id,
              'roleId', member_roles.role_id,
              'roleName', member_roles.name,
              'status', member_roles.status,
              'moduleKeys', COALESCE(member_module_access.module_keys, ARRAY[]::integer[]),
              'targetAppIds', COALESCE((
                SELECT array_agg(uta.target_app_id ORDER BY uta.target_app_id)
                FROM user_target_app_access uta
                INNER JOIN guided_workflow_target_apps gta ON gta.id = uta.target_app_id
                WHERE uta.user_id = users.id
                  AND gta.company_id = member_roles.company_id
                  AND uta.deleted_at IS NULL
              ), ARRAY[]::uuid[]),
              'isPrimary', member_roles.is_primary
            )
            ORDER BY member_roles.company_name
          ) AS memberships
          FROM (
            SELECT
              member_ucr.company_id,
              member_ucr.role_id,
              member_ucr.status,
              member_ucr.is_primary,
              member_roles.name,
              member_roles.is_system,
              member_roles.is_admin_role,
              member_companies.name AS company_name
            FROM user_company_roles member_ucr
            INNER JOIN companies member_companies ON member_companies.id = member_ucr.company_id
            INNER JOIN roles member_roles ON member_roles.id = member_ucr.role_id
            WHERE member_ucr.user_id = users.id
              AND member_ucr.deleted_at IS NULL
              AND member_companies.deleted_at IS NULL
              AND member_roles.deleted_at IS NULL
          ) member_roles
          LEFT JOIN LATERAL (
            WITH role_modules AS (
              SELECT modules.key AS module_key, 'allow'::text AS effect
              FROM modules
              WHERE member_roles.is_system = true
              UNION ALL
              SELECT module_key, 'allow'::text AS effect
              FROM role_module_permissions
              WHERE member_roles.is_system = false
                AND role_id = member_roles.role_id
                AND deleted_at IS NULL
            ),
            merged_permissions AS (
              SELECT module_key, effect FROM role_modules
              UNION ALL
              SELECT module_key, effect
              FROM user_module_permissions
              WHERE user_id = users.id
                AND company_id = member_roles.company_id
                AND deleted_at IS NULL
            ),
            effective_permissions AS (
              SELECT DISTINCT ON (module_key) module_key, effect
              FROM merged_permissions
              ORDER BY module_key, CASE WHEN effect = 'deny' THEN 2 ELSE 1 END DESC
            )
            SELECT array_agg(modules.key ORDER BY modules.sort_order, modules.name) FILTER (WHERE effective_permissions.effect = 'allow') AS module_keys
            FROM effective_permissions
            INNER JOIN modules ON modules.key = effective_permissions.module_key
          ) member_module_access ON true
        ) membership_details ON true
        LEFT JOIN LATERAL (
          WITH role_modules AS (
            SELECT modules.key AS module_key, 'allow'::text AS effect
            FROM modules
            WHERE roles.is_system = true
            UNION ALL
            SELECT module_key, 'allow'::text AS effect
            FROM role_module_permissions
            WHERE roles.is_system = false
              AND role_id = user_company_roles.role_id
              AND deleted_at IS NULL
          ),
          merged_permissions AS (
            SELECT module_key, effect FROM role_modules
            UNION ALL
            SELECT module_key, effect
            FROM user_module_permissions
            WHERE user_id = users.id
              AND company_id = user_company_roles.company_id
              AND deleted_at IS NULL
          ),
          effective_permissions AS (
            SELECT DISTINCT ON (module_key) module_key, effect
            FROM merged_permissions
            ORDER BY module_key, CASE WHEN effect = 'deny' THEN 2 ELSE 1 END DESC
          )
          SELECT array_agg(modules.key ORDER BY modules.sort_order, modules.name) FILTER (WHERE effective_permissions.effect = 'allow') AS module_keys
          FROM effective_permissions
          INNER JOIN modules ON modules.key = effective_permissions.module_key
        ) module_access ON true
        WHERE ${where}
        ORDER BY users.created_at DESC, users.id DESC
        LIMIT $5 OFFSET $6
      `,
      params
    ),
    getPool().query<{ total: string }>(
      `
        SELECT COUNT(*) AS total
        FROM users
        INNER JOIN user_company_roles ON user_company_roles.user_id = users.id
        INNER JOIN companies ON companies.id = user_company_roles.company_id
        INNER JOIN roles ON roles.id = user_company_roles.role_id
        WHERE ${where}
      `,
      params.slice(0, 4)
    )
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);

  return {
    employees: rowsResult.rows.map(mapEmployee),
    page,
    pageSize,
    total,
    pageCount: Math.max(Math.ceil(total / pageSize), 1)
  };
}

export async function registerEmployee(input: RegisterEmployeeInput, session: AdminSession) {
  assertCanManageUsers(session);

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const employeeCode = input.employeeCode?.trim() || null;
  const temporaryPassword = "test123";
  const companyIds = input.companyIds?.length ? input.companyIds : input.companyId ? [input.companyId] : [];

  if (companyIds.length === 0 || !input.roleId || !name || !email) {
    throw new EmployeeError("Company, role, name, and email are required.");
  }

  const roleTemplate = await getRoleTemplate(input.roleId);
  if (roleTemplate?.is_system) {
    throw new EmployeeError("System roles cannot be assigned from User Management.");
  }
  const companyRoles = await getCompanyRoleIds(companyIds, roleTemplate?.name ?? "");
  const primaryCompanyId = companyRoles[0]?.company_id;
  const primaryRoleId = companyRoles[0]?.role_id;

  if (!primaryCompanyId || !primaryRoleId) {
    throw new EmployeeError("Company, role, name, and email are required.");
  }

  // Check for duplicate email within the company (per-company validation)
  const duplicateCheck = await getPool().query<{ user_id: string }>(
    `
      SELECT users.id AS user_id
      FROM users
      INNER JOIN user_company_roles ON user_company_roles.user_id = users.id
      WHERE lower(users.email) = lower($1)
        AND user_company_roles.company_id = $2::uuid
        AND user_company_roles.deleted_at IS NULL
        AND users.deleted_at IS NULL
      LIMIT 1
    `,
    [email, primaryCompanyId]
  );

  if (duplicateCheck.rows.length > 0) {
    throw new EmployeeError("A user with this email already exists in this company. If they resigned, please deactivate their previous record first.");
  }

  // Check for duplicate employee code within the company (if provided)
  if (employeeCode) {
    const codeCheck = await getPool().query<{ user_id: string }>(
      `
        SELECT users.id AS user_id
        FROM users
        INNER JOIN user_company_roles ON user_company_roles.user_id = users.id
        WHERE lower(users.employee_code) = lower($1)
          AND user_company_roles.company_id = $2::uuid
          AND user_company_roles.deleted_at IS NULL
          AND users.deleted_at IS NULL
        LIMIT 1
      `,
      [employeeCode, primaryCompanyId]
    );

    if (codeCheck.rows.length > 0) {
      throw new EmployeeError("A user with this employee code already exists in this company.");
    }
  }

  try {
    const userResult = await getPool().query<{ id: string }>(
      `
        INSERT INTO users (
          name,
          email,
          employee_code,
          password_hash,
          status,
          can_view_chatbot,
          activated_at,
          invited_at,
          must_change_password,
          created_by,
          updated_by
        )
        VALUES ($1, lower($2), $3, $4, 'active', true, now(), now(), $5, $6, $6)
        RETURNING id
      `,
      [
        name,
        email,
        employeeCode,
        null,
        false,
        session.user.id
      ]
    );

    await getPool().query(
      `
        INSERT INTO user_company_roles (user_id, company_id, role_id, status, is_primary, created_by, updated_by)
        SELECT $1::uuid, (membership.company_id::text)::uuid, (membership.role_id::text)::uuid, 'active', ROW_NUMBER() OVER (PARTITION BY $1 ORDER BY membership.company_id) = 1 AS is_primary, $2::uuid, $2::uuid
        FROM jsonb_to_recordset($3::jsonb) AS membership(company_id text, role_id text)
        ON CONFLICT (user_id, company_id)
        DO UPDATE SET role_id = EXCLUDED.role_id, status = EXCLUDED.status, deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      [userResult.rows[0].id, session.user.id, JSON.stringify(companyRoles)]
    );

    await Promise.all(
      companyRoles.map((companyRole) =>
        replaceUserModuleOverrides(userResult.rows[0].id, companyRole.company_id, input.moduleKeys ?? [], session.user.id)
      )
    );
    const modules = await getEffectiveUserModules(userResult.rows[0].id, primaryRoleId, roleTemplate?.is_system === true, primaryCompanyId);
    const hasControlPanelAccess = modules.length > 0;

    if (hasControlPanelAccess) {
      await getPool().query(
        `
          UPDATE users
          SET password_hash = $2, must_change_password = true, updated_by = $3, updated_at = now()
          WHERE id = $1
        `,
        [userResult.rows[0].id, hashPassword(temporaryPassword), session.user.id]
      );
    }

    if (hasControlPanelAccess) {
      await sendEmail({
        to: email,
        subject: "Your Scout Control Panel access",
        body: `Hello ${name},\n\nYou can now access the Scout chatbot and Control Panel.\n\nLogin URL: ${process.env.APP_BASE_URL || "http://localhost:3000"}/control-panel/login\nLogin ID: ${email}\nTemporary password: ${temporaryPassword}\n\nYou will be asked to change this password after your first login.`
      });
    } else {
      await sendEmail({
        to: email,
        subject: "Your Scout chatbot access is ready",
        body: `Hello ${name},\n\nYou can now access the Scout chatbot.`
      });
    }

    return userResult.rows[0].id;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new EmployeeError("A user with this email or user code already exists for the company.");
    }

    throw error;
  }
}

export async function updateEmployee(employeeId: string, input: UpdateEmployeeInput, session: AdminSession) {
  assertCanManageUsers(session);
  await assertUserIsEditable(employeeId);

  const name = input.name.trim();
  const employeeCode = input.employeeCode?.trim() || null;
  const temporaryPassword = "test123";
  const companyId = input.companyId || input.companyIds?.[0] || "";
  const nextStatus = normalizeEmployeeStatus(input.status);

  if (!employeeId || !companyId || !input.roleId || !name) {
    throw new EmployeeError("Company, role, and name are required.");
  }

  assertCanAccessCompany(companyId, session);

  const roleTemplate = await getRoleTemplate(input.roleId);
  if (roleTemplate?.is_system) {
    throw new EmployeeError("System roles cannot be assigned from User Management.");
  }
  const companyRoles = await getCompanyRoleIds([companyId], roleTemplate?.name ?? "");
  const primaryCompanyId = companyRoles[0]?.company_id;
  const primaryRoleId = companyRoles[0]?.role_id;

  if (!primaryCompanyId || !primaryRoleId) {
    throw new EmployeeError("Company, role, name, and email are required.");
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query<{
      password_hash: string | null;
      status: EmployeeStatus;
      email: string;
      membership_status: "active" | "inactive" | null;
    }>(
      `SELECT users.password_hash, users.status, users.email, user_company_roles.status AS membership_status
       FROM users
       LEFT JOIN user_company_roles
         ON user_company_roles.user_id = users.id
        AND user_company_roles.company_id = $2
        AND user_company_roles.deleted_at IS NULL
       WHERE users.id = $1 AND users.deleted_at IS NULL
       FOR UPDATE OF users`,
      [employeeId, primaryCompanyId]
    );

    const existing = existingResult.rows[0];

    if (!existing) {
      throw new EmployeeError("User was not found.");
    }

    if (existing.status === "invited" && nextStatus !== "invited") {
      throw new EmployeeError("Invited users cannot be activated or inactivated until they accept the invitation.");
    }

    if (nextStatus === "inactive" && existing.membership_status !== "inactive") {
      requireReason(input.statusReason, "inactivating a user");
    }

    await replaceUserModuleOverrides(employeeId, primaryCompanyId, input.moduleKeys ?? [], session.user.id, client);
    const targetAppIds = Array.from(new Set(input.targetAppIds ?? []));
    if (targetAppIds.length > 0) {
      const validApps = await client.query<{ id: string }>(
        `SELECT id FROM guided_workflow_target_apps
         WHERE company_id = $1 AND id = ANY($2::uuid[])`,
        [primaryCompanyId, targetAppIds]
      );
      if (validApps.rowCount !== targetAppIds.length) {
        throw new EmployeeError("One or more selected target apps do not belong to the selected company.");
      }
    }
    await client.query(
      `UPDATE user_target_app_access uta
       SET deleted_at = NOW(), deleted_by = $3, updated_at = NOW(), updated_by = $3
       FROM guided_workflow_target_apps gta
       WHERE uta.target_app_id = gta.id
         AND uta.user_id = $1 AND gta.company_id = $2
         AND uta.deleted_at IS NULL`,
      [employeeId, primaryCompanyId, session.user.id]
    );
    for (const targetAppId of targetAppIds) {
      await client.query(
        `INSERT INTO user_target_app_access (user_id, target_app_id, created_by, updated_by)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (user_id, target_app_id) DO UPDATE
         SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [employeeId, targetAppId, session.user.id]
      );
    }
    const modules = await getEffectiveUserModules(employeeId, primaryRoleId, roleTemplate?.is_system === true, primaryCompanyId, client);
    const hasControlPanelAccess = modules.length > 0;
    const shouldSendPanelPassword = hasControlPanelAccess && !existing.password_hash;
    const result = await client.query(
      `
        UPDATE users
        SET
          name = $2,
          employee_code = $3,
          password_hash = CASE WHEN $6::boolean = true THEN $7 ELSE password_hash END,
          status = CASE WHEN status = 'invited' THEN status ELSE 'active' END,
          can_view_chatbot = true,
          must_change_password = CASE
            WHEN $4 = false THEN false
            WHEN $6::boolean = true THEN true
            ELSE must_change_password
          END,
          updated_by = $5,
          updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [
        employeeId,
        name,
        employeeCode,
        hasControlPanelAccess,
        session.user.id,
        shouldSendPanelPassword,
        shouldSendPanelPassword ? hashPassword(temporaryPassword) : null
      ]
    );

    if (result.rowCount !== 1) {
      throw new EmployeeError("User was not found.");
    }

    await client.query(
      `
        INSERT INTO user_company_roles (user_id, company_id, role_id, status, is_primary, created_by, updated_by)
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $5::text,
          NOT EXISTS (
            SELECT 1 FROM user_company_roles
            WHERE user_id = $1::uuid AND deleted_at IS NULL
          ),
          $4::uuid,
          $4::uuid
        )
        ON CONFLICT (user_id, company_id)
        DO UPDATE SET role_id = EXCLUDED.role_id, status = EXCLUDED.status, deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      [employeeId, primaryCompanyId, primaryRoleId, session.user.id, nextStatus === "invited" ? "active" : nextStatus]
    );

    if (nextStatus === "inactive" && existing.membership_status !== "inactive") {
      await client.query(
        `
          INSERT INTO user_lifecycle_events
            (user_id, company_id, action, from_status, to_status, reason, performed_by)
          VALUES ($1, $2, 'inactivated', $3, 'inactive', $4, $5)
        `,
        [employeeId, primaryCompanyId, existing.membership_status ?? "active", requireReason(input.statusReason, "inactivating a user"), session.user.id]
      );
    }

    await client.query("COMMIT");

    if (shouldSendPanelPassword) {
      await sendEmail({
        to: existing.email,
        subject: "Your Scout Control Panel access",
        body: `Hello ${name},\n\nYou can now access the Scout chatbot and Control Panel.\n\nLogin URL: ${process.env.APP_BASE_URL || "http://localhost:3000"}/control-panel/login\nLogin ID: ${existing.email}\nTemporary password: ${temporaryPassword}\n\nYou will be asked to change this password after your first login.`
      });
    }
  } catch (error) {
    await client.query("ROLLBACK");

    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new EmployeeError("A user with this email or user code already exists for the company.");
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function deleteEmployee(employeeId: string, reason: string | undefined, session: AdminSession) {
  assertCanManageUsers(session);
  await assertUserIsEditable(employeeId);

  if (!employeeId) {
    throw new EmployeeError("User is required.");
  }

  if (employeeId === session.user.id) {
    throw new EmployeeError("You cannot delete your own account.");
  }

  const deletionReason = requireReason(reason, "deleting a user");
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query<{ status: EmployeeStatus }>(
      "SELECT status FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [employeeId]
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      throw new EmployeeError("User was not found.");
    }

    const result = await client.query(
      `
        UPDATE users
        SET status = 'deleted', deleted_at = now(), updated_by = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [employeeId, session.user.id]
    );

    if (result.rowCount !== 1) {
      throw new EmployeeError("User was not found.");
    }

    await client.query(
      `
        UPDATE user_company_roles
        SET deleted_at = now(), updated_by = $2, updated_at = now()
        WHERE user_id = $1 AND deleted_at IS NULL
      `,
      [employeeId, session.user.id]
    );

    await client.query(
      `
        UPDATE user_module_permissions
        SET deleted_at = now(), updated_by = $2, updated_at = now()
        WHERE user_id = $1 AND deleted_at IS NULL
      `,
      [employeeId, session.user.id]
    );

    await client.query(
      `
        INSERT INTO user_lifecycle_events
          (user_id, company_id, action, from_status, to_status, reason, performed_by)
        VALUES ($1, NULL, 'deleted', $2, 'deleted', $3, $4)
      `,
      [employeeId, existing.status, deletionReason, session.user.id]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function activateEmployeeAccount(token: string, password: string) {
  if (!token || password.length < 8) {
    throw new EmployeeError("A valid activation token and password are required.");
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<{ id: string; user_id: string }>(
      `
        SELECT id, user_id
        FROM employee_activation_tokens
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
        LIMIT 1
        FOR UPDATE
      `,
      [hashToken(token)]
    );

    const activation = tokenResult.rows[0];

    if (!activation) {
      throw new EmployeeError("Activation link is invalid or expired.");
    }

    await client.query(
      `
        UPDATE users
        SET
          password_hash = $2,
          status = 'active',
          activated_at = now(),
          updated_by = id,
          updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [activation.user_id, hashPassword(password)]
    );

    await client.query(
      `
        UPDATE user_company_roles
        SET status = 'active', updated_by = $1, updated_at = now()
        WHERE user_id = $1 AND deleted_at IS NULL
      `,
      [activation.user_id]
    );

    await client.query("UPDATE employee_activation_tokens SET used_at = now() WHERE id = $1", [activation.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
