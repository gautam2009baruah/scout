import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db/pool";
import { getEffectiveUserModules } from "./permissions";
import { verifyPassword } from "./password";
import type { AdminLoginCredentials, AdminSession } from "./auth";

export const ADMIN_SESSION_COOKIE = "scout_admin_session";
export const ADMIN_SESSION_MINUTES = 15;

type SessionRow = {
  session_id: string;
  expires_at: Date;
  user_id: string;
  company_id: string;
  name: string;
  email: string;
  status: string;
  role_id: string;
  is_admin_role: boolean;
  must_change_password: boolean;
  company_slug: string;
  company_name: string;
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function toAdminSession(row: SessionRow): Promise<AdminSession> {
  const modules = await getEffectiveUserModules(row.user_id, row.role_id, row.is_admin_role);

  return {
    user: {
      id: row.user_id,
      tenantId: row.company_id,
      name: row.name,
      email: row.email,
      roleId: row.role_id,
      isAdminRole: row.is_admin_role,
      isActive: row.status === "active",
      mustChangePassword: row.must_change_password
    },
    tenant: {
      tenantId: row.company_id,
      slug: row.company_slug,
      name: row.company_name
    },
    modules,
    expiresAt: row.expires_at
  };
}

export async function createAdminSession(credentials: AdminLoginCredentials) {
  const email = credentials.email.trim().toLowerCase();

  const userResult = await getPool().query<{
    user_id: string;
    company_id: string;
    name: string;
    email: string;
    password_hash: string;
    status: string;
    role_id: string;
    is_admin_role: boolean;
    must_change_password: boolean;
    company_slug: string;
    company_name: string;
  }>(
    `
      SELECT
        users.id AS user_id,
        users.company_id,
        users.name,
        users.email,
        users.password_hash,
        users.status,
        roles.id AS role_id,
        roles.is_admin_role,
        users.must_change_password,
        companies.slug AS company_slug,
        companies.name AS company_name
      FROM users
      INNER JOIN companies ON companies.id = users.company_id
      INNER JOIN roles ON roles.id = users.role_id
      WHERE users.email = $1
        AND users.deleted_at IS NULL
        AND companies.deleted_at IS NULL
      ORDER BY users.created_at ASC
      LIMIT 2
    `,
    [email]
  );

  const user = userResult.rows[0];

  if (userResult.rowCount !== 1) {
    return null;
  }

  if (!user || user.status !== "active" || !user.password_hash || !verifyPassword(credentials.password, user.password_hash)) {
    return null;
  }

  const modules = await getEffectiveUserModules(user.user_id, user.role_id, user.is_admin_role);

  if (modules.length === 0) {
    return null;
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000);

  await getPool().query(
    `
      INSERT INTO user_sessions (user_id, company_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [user.user_id, user.company_id, tokenHash, expiresAt]
  );

  await getPool().query("UPDATE users SET last_login_at = now(), updated_by = id, updated_at = now() WHERE id = $1", [user.user_id]);

  return {
    token,
    session: {
      ...(await toAdminSession({
      session_id: "",
      expires_at: expiresAt,
      user_id: user.user_id,
      company_id: user.company_id,
      name: user.name,
      email: user.email,
      status: user.status,
      role_id: user.role_id,
      is_admin_role: user.is_admin_role,
      must_change_password: user.must_change_password,
      company_slug: user.company_slug,
      company_name: user.company_name
      })),
      modules
    }
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
        users.company_id,
        users.name,
        users.email,
        users.status,
        roles.id AS role_id,
        roles.is_admin_role,
        users.must_change_password,
        companies.slug AS company_slug,
        companies.name AS company_name
      FROM user_sessions
      INNER JOIN users ON users.id = user_sessions.user_id
      INNER JOIN companies ON companies.id = user_sessions.company_id
      INNER JOIN roles ON roles.id = users.role_id
      WHERE user_sessions.token_hash = $1
        AND user_sessions.revoked_at IS NULL
        AND user_sessions.expires_at > now()
        AND users.status = 'active'
      LIMIT 1
    `,
    [hashToken(token)]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const nextExpiresAt = new Date(Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000);
  await getPool().query("UPDATE user_sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1", [row.session_id, nextExpiresAt]);
  row.expires_at = nextExpiresAt;

  return toAdminSession(row);
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
