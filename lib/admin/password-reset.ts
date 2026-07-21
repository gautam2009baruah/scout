import { createHash, randomBytes } from "crypto";
import { getPool } from "@/lib/db/pool";
import { sendEmail } from "./email";
import { hashPassword } from "./password";

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

/**
 * Start a password reset for the given email. If an active user exists, a
 * single-use reset token is created and emailed. Never reveals whether the
 * email is registered, to avoid account enumeration.
 */
export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return;
  }

  const userResult = await getPool().query<{ id: string; name: string; email: string }>(
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
    return;
  }

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

  await sendEmail({
    to: user.email,
    subject: "Reset your Scout Control Panel password",
    body: `Hello ${user.name},\n\nWe received a request to reset your Scout Control Panel password.\n\nReset link: ${resetUrl}\n\nThis link expires in ${RESET_TOKEN_MINUTES} minutes and can be used once. If you did not request a password reset, you can safely ignore this email.`
  });
}

/**
 * Complete a password reset using a valid token. Updates the password, marks
 * the token used, and revokes any active sessions for the user.
 */
export async function resetPassword(token: string, password: string) {
  if (!token || password.length < 8) {
    throw new PasswordResetError("A valid reset token and a password of at least 8 characters are required.");
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
