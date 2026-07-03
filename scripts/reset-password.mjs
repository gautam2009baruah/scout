// Script to reset a user's password
// Run with: node scripts/reset-password.mjs [email] [new-password]

import pg from "pg";
import { randomBytes, scryptSync } from "crypto";

const { Pool } = pg;

// Parse DATABASE_URL or use individual env vars
let poolConfig;
if (process.env.DATABASE_URL) {
  poolConfig = { connectionString: process.env.DATABASE_URL };
} else {
  poolConfig = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "scout",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
  };
}

const pool = new Pool(poolConfig);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  }).toString("hex");

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key}`;
}

async function resetPassword(email, newPassword) {
  try {
    console.log("\n🔐 Resetting password for:", email);
    console.log("━".repeat(60));

    const emailLower = email.trim().toLowerCase();

    // Find user
    const userResult = await pool.query(
      `SELECT id, name, email, status FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [emailLower]
    );

    if (userResult.rowCount === 0) {
      console.log("\n❌ No user found with this email");
      return;
    }

    const user = userResult.rows[0];

    console.log("\n✅ User found:");
    console.log(`   User ID: ${user.id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Status: ${user.status}`);

    // Hash new password
    console.log("\n🔒 Hashing new password...");
    const passwordHash = hashPassword(newPassword);

    // Update password
    await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW(), updated_by = id WHERE id = $2`,
      [passwordHash, user.id]
    );

    console.log("\n✅✅✅ PASSWORD RESET SUCCESSFUL! ✅✅✅");
    console.log("\nYou can now login with:");
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${newPassword}`);

  } catch (error) {
    console.error("\n❌ Error during password reset:", error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.log("Usage: node scripts/reset-password.mjs [email] [new-password]");
  console.log("Example: node scripts/reset-password.mjs admin@company.com NewPassword123!");
  process.exit(1);
}

resetPassword(email, newPassword);
