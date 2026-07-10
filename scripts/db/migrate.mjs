import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import "./load-env.mjs";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const client = new Client({ connectionString: databaseUrl });
const migrationsPath = join(process.cwd(), "db", "migrations");
const migrationFiles = (await readdir(migrationsPath))
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

function migrationVersion(fileName) {
  const match = fileName.match(/^(\d+)_/);
  return match ? Number(match[1]) : 0;
}

async function hasColumn(tableName, columnName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS present
    `,
    [tableName, columnName]
  );

  return Boolean(result.rows[0]?.present);
}

async function shouldBaselineLegacyDatabase() {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'users'
      ) AS initialized
    `
  );

  return Boolean(result.rows[0]?.initialized);
}

async function detectBaselineVersion() {
  if (await hasColumn("guided_workflow_revoked_recorder_tokens", "revoked_by")) {
    return 82;
  }

  if (await hasColumn("guided_workflow_topics", "recording_enabled")) {
    return 81;
  }

  return 0;
}

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      file_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const initialApplied = await client.query("SELECT file_name FROM schema_migrations");
  if (initialApplied.rowCount === 0 && await shouldBaselineLegacyDatabase()) {
    const baselineVersion = await detectBaselineVersion();
    if (baselineVersion > 0) {
      const baselineFiles = migrationFiles.filter((file) => migrationVersion(file) <= baselineVersion);

      if (baselineFiles.length > 0) {
        await client.query("BEGIN");
        for (const fileName of baselineFiles) {
          await client.query(
            "INSERT INTO schema_migrations (file_name) VALUES ($1) ON CONFLICT (file_name) DO NOTHING",
            [fileName]
          );
        }
        await client.query("COMMIT");
        console.log(`Legacy baseline detected. Marked migrations through ${baselineVersion.toString().padStart(3, "0")}.`);
      }
    }
  }

  const appliedResult = await client.query("SELECT file_name FROM schema_migrations");
  const applied = new Set(appliedResult.rows.map((row) => row.file_name));

  for (const migrationFile of migrationFiles) {
    if (applied.has(migrationFile)) {
      continue;
    }

    const sql = await readFile(join(migrationsPath, migrationFile), "utf8");

    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (file_name) VALUES ($1)",
      [migrationFile]
    );
    await client.query("COMMIT");
    console.log(`Applied ${migrationFile}.`);
  }

  console.log("Database migrations completed.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
