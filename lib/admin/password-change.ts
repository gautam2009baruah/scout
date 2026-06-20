import { getPool } from "@/lib/db/pool";
import type { AdminSession } from "./auth";
import { hashPassword } from "./password";

export class PasswordChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordChangeError";
  }
}

export async function changeCurrentUserPassword(session: AdminSession, password: string) {
  if (password.length < 8) {
    throw new PasswordChangeError("Password must be at least 8 characters.");
  }

  await getPool().query(
    `
      UPDATE users
      SET
        password_hash = $2,
        must_change_password = false,
        updated_by = $1,
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [session.user.id, hashPassword(password)]
  );
}
