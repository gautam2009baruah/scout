import { createHash, randomBytes } from "crypto";
import { getPool } from "@/lib/db/pool";
import { getPrimarySenderCredentialId, sendEmail } from "./email";
import { hashPassword, isPasswordComplexityValid, PASSWORD_REQUIREMENT_MESSAGE } from "./password";

const RESET_TOKEN_MINUTES = 60;

export class PasswordResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordResetError";
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type ResetRecipient = { id: string; name: string; email: string };

async function issuePasswordResetEmail(user: ResetRecipient) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000);

  // Invalidate any outstanding reset tokens for this user before issuing a new one.
  await getPool().query(
    "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
    [user.id]
  );

  await getPool().query(
    `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [user.id, tokenHash, expiresAt]
  );

  const resetUrl = `${process.env.APP_BASE_URL || "http://localhost:3000"}/control-panel/reset-password?token=${token}`;

  const companyResult = await getPool().query<{ company_id: string }>(
    `
      SELECT company_id
      FROM user_company_roles
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY is_primary DESC NULLS LAST, created_at ASC
      LIMIT 1
    `,
    [user.id]
  );
  const companyId = companyResult.rows[0]?.company_id;
  const senderCredentialId = companyId ? await getPrimarySenderCredentialId(companyId) : null;

  await sendEmail({
    to: user.email,
    subject: "Reset your Scout Control Panel password",
    body: `Hello ${user.name},\n\nWe received a request to reset your Scout Control Panel password.\n\nReset link: ${resetUrl}\n\nThis link expires in ${RESET_TOKEN_MINUTES} minutes and can be used once. If you did not request a password reset, you can safely ignore this email.`,
    senderCredentialId: senderCredentialId ?? undefined,
    companyId
  });
}

/**
 * Start a password reset for the given email. The email must belong to an
 * active, non-deleted user; otherwise a PasswordResetError is thrown so the
 * caller can tell the requester no such account exists.
 */
export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new PasswordResetError("No account found with this email address.");
  }

  const userResult = await getPool().query<ResetRecipient>(
    `
      SELECT id, name, email
      FROM users
      WHERE email = $1
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [normalizedEmail]
  );

  const user = userResult.rows[0];

  if (!user) {
    throw new PasswordResetError("No account found with this email address.");
  }

  await issuePasswordResetEmail(user);
}

/**
 * Admin-triggered password reset for a specific user id. Same email flow as
 * requestPasswordReset, but looked up by id since the caller (User Management)
 * already knows which account it means to reset.
 */
export async function adminRequestPasswordReset(userId: string) {
  const userResult = await getPool().query<ResetRecipient>(
    `
      SELECT id, name, email
      FROM users
      WHERE id = $1
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );

  const user = userResult.rows[0];

  if (!user) {
    throw new PasswordResetError("User was not found.");
  }

  await issuePasswordResetEmail(user);
}

/**
 * Complete a password reset using a valid token. Updates the password, marks
 * the token used, and revokes any active sessions for the user.
 */
export async function resetPassword(token: string, password: string) {
  if (!token) {
    throw new PasswordResetError("A valid reset token is required.");
  }

  if (!isPasswordComplexityValid(password)) {
    throw new PasswordResetError(PASSWORD_REQUIREMENT_MESSAGE);
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<{ id: string; user_id: string }>(
      `
        SELECT id, user_id
        FROM password_reset_tokens
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
        LIMIT 1
        FOR UPDATE
      `,
      [hashToken(token)]
    );

    const reset = tokenResult.rows[0];

    if (!reset) {
      throw new PasswordResetError("Reset link is invalid or expired.");
    }

    await client.query(
      `
        UPDATE users
        SET
          password_hash = $2,
          must_change_password = false,
          updated_by = id,
          updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [reset.user_id, hashPassword(password)]
    );

    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [reset.id]);

    // Revoke existing sessions so the old password can no longer be used.
    await client.query(
      "UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [reset.user_id]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
