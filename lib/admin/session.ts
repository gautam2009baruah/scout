import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db/pool";
import { getEffectiveUserModules } from "./permissions";
import { verifyPassword } from "./password";
import type { AdminLoginCredentials, AdminSession, UserCompanyAccess } from "./auth";

export const ADMIN_SESSION_COOKIE = "scout_admin_session";
export const ADMIN_SESSION_MINUTES = 15;

type SessionRow = {
  session_id: string;
  expires_at: Date;
  user_id: string;
  current_company_id: string;
  name: string;
  email: string;
  status: string;
  current_role_id: string;
  is_system: boolean;
  is_admin_role: boolean;
  must_change_password: boolean;
  company_slug: string;
  company_name: string;
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Fetch all companies user has access to (from user_company_roles)
 */
async function getUserCompanyAccess(userId: string): Promise<UserCompanyAccess[]> {
  const result = await getPool().query<{
    company_id: string;
    company_name: string;
    company_slug: string;
    role_id: string;
    role_name: string;
    is_system: boolean;
    is_admin_role: boolean;
    is_primary: boolean;
  }>(
    `
      SELECT
        ucr.company_id,
        c.name AS company_name,
        c.slug AS company_slug,
        ucr.role_id,
        r.name AS role_name,
        r.is_system,
        r.is_admin_role,
        ucr.is_primary
      FROM user_company_roles ucr
      INNER JOIN companies c ON c.id = ucr.company_id
      INNER JOIN roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = $1
        AND ucr.deleted_at IS NULL
        AND ucr.status = 'active'
        AND c.deleted_at IS NULL
        AND r.deleted_at IS NULL
      ORDER BY ucr.is_primary DESC, ucr.created_at ASC
    `,
    [userId]
  );

  return result.rows.map(row => ({
    companyId: row.company_id,
    companyName: row.company_name,
    companySlug: row.company_slug,
    roleId: row.role_id,
    roleName: row.role_name,
    isPrimary: row.is_primary
  }));
}

/**
 * Get primary company for user (or first one if none marked as primary)
 */
function getPrimaryCompany(companies: UserCompanyAccess[]): UserCompanyAccess | null {
  return companies.find(c => c.isPrimary) || companies[0] || null;
}

async function toAdminSession(
  row: SessionRow,
  availableCompanies: UserCompanyAccess[]
): Promise<AdminSession> {
  const modules = await getEffectiveUserModules(row.user_id, row.current_role_id, row.is_system, row.current_company_id);

  return {
    user: {
      id: row.user_id,
      tenantId: row.current_company_id,
      name: row.name,
      email: row.email,
      roleId: row.current_role_id,
      isAdminRole: row.is_admin_role,
      isActive: row.status === "active",
      mustChangePassword: row.must_change_password
    },
    tenant: {
      tenantId: row.current_company_id,
      slug: row.company_slug,
      name: row.company_name
    },
    modules,
    availableCompanies,
    expiresAt: row.expires_at
  };
}

export async function createAdminSession(credentials: AdminLoginCredentials) {
  const email = credentials.email.trim().toLowerCase();

  // Find user by email
  const userResult = await getPool().query<{
    user_id: string;
    name: string;
    email: string;
    password_hash: string;
    status: string;
  }>(
    `
      SELECT
        users.id AS user_id,
        users.name,
        users.email,
        users.password_hash,
        users.status
      FROM users
      WHERE users.email = $1
        AND users.deleted_at IS NULL
    `,
    [email]
  );

  const user = userResult.rows[0];

  if (!user || user.status !== "active" || !user.password_hash) {
    return null;
  }

  if (!verifyPassword(credentials.password, user.password_hash)) {
    return null;
  }

  // Get all companies user has access to
  const availableCompanies = await getUserCompanyAccess(user.user_id);

  if (availableCompanies.length === 0) {
    return null; // User has no company access
  }

  // Get primary company
  const primaryCompany = getPrimaryCompany(availableCompanies);
  if (!primaryCompany) {
    return null;
  }

  // Get role flags from role table
  const roleResult = await getPool().query<{ is_admin_role: boolean; is_system: boolean }>(
    `SELECT is_admin_role, is_system FROM roles WHERE id = $1`,
    [primaryCompany.roleId]
  );

  if (roleResult.rowCount === 0) {
    return null;
  }

  const roleFlags = roleResult.rows[0];

  // Verify modules exist for this role
  const modules = await getEffectiveUserModules(user.user_id, primaryCompany.roleId, roleFlags.is_system, primaryCompany.companyId);
  if (modules.length === 0) {
    return null;
  }

  // Create session token
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000);

  // Store session with primary company
  await getPool().query(
    `
      INSERT INTO user_sessions (user_id, company_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [user.user_id, primaryCompany.companyId, tokenHash, expiresAt]
  );

  await getPool().query("UPDATE users SET last_login_at = now(), updated_by = id, updated_at = now() WHERE id = $1", [user.user_id]);

  // Get full session data
  const sessionRow: SessionRow = {
    session_id: "",
    expires_at: expiresAt,
    user_id: user.user_id,
    current_company_id: primaryCompany.companyId,
    name: user.name,
    email: user.email,
    status: user.status,
    current_role_id: primaryCompany.roleId,
    is_system: roleFlags.is_system,
    is_admin_role: roleFlags.is_admin_role,
    must_change_password: false,
    company_slug: primaryCompany.companySlug,
    company_name: primaryCompany.companyName
  };

  return {
    token,
    session: await toAdminSession(sessionRow, availableCompanies)
  };
}

export async function getCurrentAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const result = await getPool().query<SessionRow>(
    `
      SELECT
        user_sessions.id AS session_id,
        user_sessions.expires_at,
        users.id AS user_id,
        user_sessions.company_id AS current_company_id,
        users.name,
        users.email,
        users.status,
        ucr.role_id AS current_role_id,
        r.is_system,
        r.is_admin_role,
        users.must_change_password,
        c.slug AS company_slug,
        c.name AS company_name
      FROM user_sessions
      INNER JOIN users ON users.id = user_sessions.user_id
      INNER JOIN companies c ON c.id = user_sessions.company_id
      INNER JOIN user_company_roles ucr ON ucr.user_id = users.id AND ucr.company_id = user_sessions.company_id AND ucr.deleted_at IS NULL AND ucr.status = 'active'
      LEFT JOIN roles r ON r.id = ucr.role_id
      WHERE user_sessions.token_hash = $1
        AND user_sessions.revoked_at IS NULL
        AND user_sessions.expires_at > now()
        AND users.status = 'active'
        AND users.deleted_at IS NULL
        AND c.deleted_at IS NULL
      LIMIT 1
    `,
    [hashToken(token)]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  // Get all companies user has access to
  const availableCompanies = await getUserCompanyAccess(row.user_id);

  if (availableCompanies.length === 0) {
    return null;
  }

  // Auto-extend session
  const nextExpiresAt = new Date(Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000);
  await getPool().query("UPDATE user_sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1", [row.session_id, nextExpiresAt]);
  row.expires_at = nextExpiresAt;

  return toAdminSession(row, availableCompanies);
}

/**
 * Switch user's current company context
 * Updates the session to point to a different company (must be in availableCompanies)
 */
export async function switchCompanyContext(userId: string, newCompanyId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return false;
  }

  // Verify user has access to this company
  const accessCheck = await getPool().query(
    `
      SELECT 1 FROM user_company_roles
      WHERE user_id = $1 AND company_id = $2 AND deleted_at IS NULL AND status = 'active'
    `,
    [userId, newCompanyId]
  );

  if (accessCheck.rowCount === 0) {
    return false; // User doesn't have access to this company
  }

  // Update session to point to new company
  const updated = await getPool().query(
    `
      UPDATE user_sessions 
      SET company_id = $1, last_seen_at = now()
      WHERE token_hash = $2 AND revoked_at IS NULL
      RETURNING id
    `,
    [newCompanyId, hashToken(token)]
  );

  return (updated.rowCount ?? 0) > 0;
}

export async function revokeCurrentAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return;
  }

  await getPool().query(
    "UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashToken(token)]
  );
}

export async function extendCurrentAdminSession(): Promise<Date | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const nextExpiresAt = new Date(Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000);
  const result = await getPool().query<{ id: string }>(
    "UPDATE user_sessions SET last_seen_at = now(), expires_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id",
    [hashToken(token), nextExpiresAt]
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  return nextExpiresAt;
}
