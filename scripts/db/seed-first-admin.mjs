import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";
import "./load-env.mjs";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
const companyName = process.env.SEED_COMPANY_NAME ?? "Scout";
const companySlug = process.env.SEED_COMPANY_SLUG ?? "scout";
const adminName = process.env.SEED_ADMIN_NAME ?? "First Admin";
const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

if (!adminEmail || !adminPassword) {
  throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required.");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1
  }).toString("hex");

  return `scrypt$16384$8$1$${salt}$${key}`;
}

const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query("BEGIN");

  const companyResult = await client.query(
    `
      INSERT INTO companies (name, slug)
      VALUES ($1, $2)
      ON CONFLICT (slug)
      DO UPDATE SET name = EXCLUDED.name, updated_at = now()
      RETURNING id
    `,
    [companyName, companySlug]
  );

  const roleResult = await client.query(
    "SELECT id FROM roles WHERE company_id IS NULL AND key = 'owner' LIMIT 1"
  );

  if (roleResult.rowCount !== 1) {
    throw new Error("Owner role was not found. Run db:migrate first.");
  }

  await client.query(
    `
      INSERT INTO users (company_id, role_id, name, email, password_hash, status)
      VALUES ($1, $2, $3, lower($4), $5, 'active')
      ON CONFLICT (company_id, email)
      DO UPDATE SET
        name = EXCLUDED.name,
        role_id = EXCLUDED.role_id,
        password_hash = EXCLUDED.password_hash,
        status = 'active',
        updated_at = now()
    `,
    [companyResult.rows[0].id, roleResult.rows[0].id, adminName, adminEmail, hashPassword(adminPassword)]
  );

  await client.query("COMMIT");
  console.log(`Seeded first admin ${adminEmail} for company ${companySlug}.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
