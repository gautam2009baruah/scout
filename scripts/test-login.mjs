// Test script to debug login issues
// Run with: node scripts/test-login.mjs [email] [password]
// Make sure DB environment variables are set in your .env.local

import pg from "pg";
import { scryptSync, timingSafeEqual } from "crypto";

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

function verifyPassword(password, passwordHash) {
  const [algorithm, nValue, rValue, pValue, salt, storedKey] = passwordHash.split("$");

  if (algorithm !== "scrypt" || !salt || !storedKey) {
    console.log("❌ Invalid password hash format");
    return false;
  }

  const storedBuffer = Buffer.from(storedKey, "hex");
  const key = scryptSync(password, salt, storedBuffer.length, {
    N: Number(nValue) || 16384,
    r: Number(rValue) || 8,
    p: Number(pValue) || 1
  });

  return storedBuffer.length === key.length && timingSafeEqual(storedBuffer, key);
}

async function testLogin(email, password) {
  try {
    console.log("\n🔍 Testing login for:", email);
    console.log("━".repeat(60));

    const emailLower = email.trim().toLowerCase();

    const result = await pool.query(
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
      [emailLower]
    );

    console.log("\n📊 Query Results:");
    console.log(`   Rows found: ${result.rowCount}`);

    if (result.rowCount === 0) {
      console.log("\n❌ No user found with this email");
      console.log("   Possible reasons:");
      console.log("   - Email doesn't exist in database");
      console.log("   - User has been soft-deleted (deleted_at IS NOT NULL)");
      console.log("   - Company has been soft-deleted");
      return;
    }

    if (result.rowCount > 1) {
      console.log("\n⚠️  Multiple users found with this email!");
      console.log("   This should not happen - email should be unique");
      return;
    }

    const user = result.rows[0];

    console.log("\n✅ User found:");
    console.log(`   User ID: ${user.user_id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Company: ${user.company_name} (${user.company_slug})`);
    console.log(`   Role ID: ${user.role_id}`);
    console.log(`   Is Admin: ${user.is_admin_role}`);
    console.log(`   Must Change Password: ${user.must_change_password}`);

    if (user.status !== "active") {
      console.log(`\n❌ User status is not "active": ${user.status}`);
      return;
    }

    if (!user.password_hash) {
      console.log("\n❌ No password hash stored for this user");
      return;
    }

    console.log("\n🔐 Verifying password...");
    const passwordValid = verifyPassword(password, user.password_hash);

    if (!passwordValid) {
      console.log("❌ Password verification failed");
      console.log("   The password provided does not match the stored hash");
      return;
    }

    console.log("✅ Password verified successfully");

    // Check modules
    console.log("\n📦 Checking user modules...");
    const modulesResult = await pool.query(
      `
        SELECT DISTINCT rm.module_name, rm.view_level, rm.edit_level
        FROM role_modules rm
        WHERE rm.role_id = $1
        UNION
        SELECT DISTINCT um.module_name, um.view_level, um.edit_level
        FROM user_module_overrides um
        WHERE um.user_id = $2
      `,
      [user.role_id, user.user_id]
    );

    console.log(`   Modules found: ${modulesResult.rowCount}`);

    if (modulesResult.rowCount === 0) {
      console.log("❌ No modules assigned to this user!");
      console.log("   User cannot login without at least one module");
      return;
    }

    console.log("\n✅ User has access to modules:");
    modulesResult.rows.forEach(m => {
      console.log(`   - ${m.module_name} (view: ${m.view_level}, edit: ${m.edit_level})`);
    });

    console.log("\n✅✅✅ LOGIN SHOULD SUCCEED! ✅✅✅");

  } catch (error) {
    console.error("\n❌ Error during test:", error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log("Usage: node scripts/test-login.mjs [email] [password]");
  console.log("Example: node scripts/test-login.mjs admin@company.com password123");
  process.exit(1);
}

testLogin(email, password);
