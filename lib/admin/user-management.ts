import { createHash } from "crypto";
import { getPool } from "@/lib/db/pool";
import type { AdminSession } from "./auth";
import { sendEmail } from "./email";
import { hashPassword } from "./password";
import { MODULE_KEYS, getEffectiveUserModules, hasModuleAccess, replaceUserModuleOverrides } from "./permissions";

export type EmployeeStatus = "active" | "invited" | "disabled";

export type EmployeeRow = {
  id: string;
  companyId: string;
  companyIds: string[];
  companyName: string;
  companyNames: string[];
  roleId: string;
  roleName: string;
  name: string;
  email: string;
  employeeCode: string | null;
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
};

export type UpdateEmployeeInput = RegisterEmployeeInput & {
  status: EmployeeStatus;
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
  name: string;
  email: string;
  employee_code: string | null;
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
    name: row.name,
    email: row.email,
    employeeCode: row.employee_code,
    status: row.status,
    canViewChatbot: row.can_view_chatbot,
    moduleKeys: row.module_keys ?? [],
    activatedAt: row.activated_at,
    invitedAt: row.invited_at,
    createdAt: row.created_at
  };
}

async function getRoleTemplate(roleId: string) {
  const result = await getPool().query<{ name: string; is_admin_role: boolean }>(
    "SELECT name, is_admin_role FROM roles WHERE id = $1 AND deleted_at IS NULL",
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
    AND companies.deleted_at IS NULL
    AND roles.deleted_at IS NULL
    AND (
      $1::uuid IS NULL
      OR users.company_id = $1
      OR EXISTS (
        SELECT 1
        FROM user_company_roles
        WHERE user_company_roles.user_id = users.id
          AND user_company_roles.company_id = $1
          AND user_company_roles.deleted_at IS NULL
      )
    )
    AND ($2::uuid IS NULL OR users.role_id = $2)
    AND ($3::text IS NULL OR users.status = $3)
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
      name: string;
      email: string;
      employee_code: string | null;
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
          users.company_id,
          COALESCE(company_memberships.company_ids, ARRAY[users.company_id]) AS company_ids,
          companies.name AS company_name,
          COALESCE(company_memberships.company_names, ARRAY[companies.name]) AS company_names,
          users.role_id,
          roles.name AS role_name,
          users.name,
          users.email,
          users.employee_code,
          users.status,
          users.can_view_chatbot,
          CASE
            WHEN roles.is_admin_role = true THEN all_modules.module_keys
            ELSE COALESCE(module_access.module_keys, ARRAY[]::integer[])
          END AS module_keys,
          users.activated_at,
          users.invited_at,
          users.created_at
        FROM users
        INNER JOIN companies ON companies.id = users.company_id
        INNER JOIN roles ON roles.id = users.role_id
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
        CROSS JOIN (
          SELECT array_agg(key ORDER BY sort_order, name) AS module_keys
          FROM modules
        ) all_modules
        LEFT JOIN LATERAL (
          WITH role_modules AS (
            SELECT module_key, 'allow'::text AS effect
            FROM role_module_permissions
            WHERE role_id = users.role_id
              AND deleted_at IS NULL
          ),
          merged_permissions AS (
            SELECT module_key, effect FROM role_modules
            UNION ALL
            SELECT module_key, effect
            FROM user_module_permissions
            WHERE user_id = users.id AND deleted_at IS NULL
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
        INNER JOIN companies ON companies.id = users.company_id
        INNER JOIN roles ON roles.id = users.role_id
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
  const companyRoles = await getCompanyRoleIds(companyIds, roleTemplate?.name ?? "");
  const primaryCompanyId = companyRoles[0]?.company_id;
  const primaryRoleId = companyRoles[0]?.role_id;

  if (!primaryCompanyId || !primaryRoleId) {
    throw new EmployeeError("Company, role, name, and email are required.");
  }

  try {
    const userResult = await getPool().query<{ id: string }>(
      `
        INSERT INTO users (
          company_id,
          role_id,
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
        VALUES ($1, $2, $3, lower($4), $5, $6, 'active', true, now(), now(), $7, $8, $8)
        RETURNING id
      `,
      [
        primaryCompanyId,
        primaryRoleId,
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
        INSERT INTO user_company_roles (user_id, company_id, role_id, created_by, updated_by)
        SELECT $1, company_id, role_id, $2, $2
        FROM jsonb_to_recordset($3::jsonb) AS membership(company_id uuid, role_id uuid)
        ON CONFLICT (user_id, company_id)
        DO UPDATE SET role_id = EXCLUDED.role_id, deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      [userResult.rows[0].id, session.user.id, JSON.stringify(companyRoles)]
    );

    await replaceUserModuleOverrides(userResult.rows[0].id, input.moduleKeys ?? [], session.user.id);
    const modules = await getEffectiveUserModules(userResult.rows[0].id, primaryRoleId, roleTemplate?.is_admin_role === true);
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

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const employeeCode = input.employeeCode?.trim() || null;
  const temporaryPassword = "test123";
  const companyIds = input.companyIds?.length ? input.companyIds : input.companyId ? [input.companyId] : [];

  if (!employeeId || companyIds.length === 0 || !input.roleId || !name || !email) {
    throw new EmployeeError("Company, role, name, and email are required.");
  }

  const roleTemplate = await getRoleTemplate(input.roleId);
  const companyRoles = await getCompanyRoleIds(companyIds, roleTemplate?.name ?? "");
  const primaryCompanyId = companyRoles[0]?.company_id;
  const primaryRoleId = companyRoles[0]?.role_id;

  if (!primaryCompanyId || !primaryRoleId) {
    throw new EmployeeError("Company, role, name, and email are required.");
  }

  try {
    const existingResult = await getPool().query<{
      password_hash: string | null;
    }>("SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL", [employeeId]);

    const existing = existingResult.rows[0];

    if (!existing) {
      throw new EmployeeError("User was not found.");
    }

    await replaceUserModuleOverrides(employeeId, input.moduleKeys ?? [], session.user.id);
    const modules = await getEffectiveUserModules(employeeId, primaryRoleId, roleTemplate?.is_admin_role === true);
    const hasControlPanelAccess = modules.length > 0;
    const shouldSendPanelPassword = hasControlPanelAccess && !existing.password_hash;
    const result = await getPool().query(
      `
        UPDATE users
        SET
          company_id = $2,
          role_id = $3,
          name = $4,
          email = lower($5),
          employee_code = $6,
          password_hash = CASE WHEN $10::boolean = true THEN $11 ELSE password_hash END,
          status = $7,
          can_view_chatbot = true,
          must_change_password = CASE
            WHEN $8 = false THEN false
            WHEN $10::boolean = true THEN true
            ELSE must_change_password
          END,
          updated_by = $9,
          updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [
        employeeId,
        primaryCompanyId,
        primaryRoleId,
        name,
        email,
        employeeCode,
        input.status,
        hasControlPanelAccess,
        session.user.id,
        shouldSendPanelPassword,
        shouldSendPanelPassword ? hashPassword(temporaryPassword) : null
      ]
    );

    if (result.rowCount !== 1) {
      throw new EmployeeError("User was not found.");
    }

    await getPool().query(
      `
        UPDATE user_company_roles
        SET deleted_at = now(), updated_by = $2, updated_at = now()
        WHERE user_id = $1 AND deleted_at IS NULL
      `,
      [employeeId, session.user.id]
    );

    await getPool().query(
      `
        INSERT INTO user_company_roles (user_id, company_id, role_id, created_by, updated_by)
        SELECT $1, company_id, role_id, $2, $2
        FROM jsonb_to_recordset($3::jsonb) AS membership(company_id uuid, role_id uuid)
        ON CONFLICT (user_id, company_id)
        DO UPDATE SET role_id = EXCLUDED.role_id, deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      [employeeId, session.user.id, JSON.stringify(companyRoles)]
    );

    if (shouldSendPanelPassword) {
      await sendEmail({
        to: email,
        subject: "Your Scout Control Panel access",
        body: `Hello ${name},\n\nYou can now access the Scout chatbot and Control Panel.\n\nLogin URL: ${process.env.APP_BASE_URL || "http://localhost:3000"}/control-panel/login\nLogin ID: ${email}\nTemporary password: ${temporaryPassword}\n\nYou will be asked to change this password after your first login.`
      });
    }
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new EmployeeError("A user with this email or user code already exists for the company.");
    }

    throw error;
  }
}

export async function deleteEmployee(employeeId: string, session: AdminSession) {
  assertCanManageUsers(session);

  if (!employeeId) {
    throw new EmployeeError("User is required.");
  }

  if (employeeId === session.user.id) {
    throw new EmployeeError("You cannot delete your own account.");
  }

  const result = await getPool().query(
    `
      UPDATE users
      SET status = 'disabled', deleted_at = now(), updated_by = $2, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [employeeId, session.user.id]
  );

  if (result.rowCount !== 1) {
    throw new EmployeeError("User was not found.");
  }

  await getPool().query(
    `
      UPDATE user_company_roles
      SET deleted_at = now(), updated_by = $2, updated_at = now()
      WHERE user_id = $1 AND deleted_at IS NULL
    `,
    [employeeId, session.user.id]
  );
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

    await client.query("UPDATE employee_activation_tokens SET used_at = now() WHERE id = $1", [activation.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
