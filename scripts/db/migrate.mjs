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

await client.connect();

try {
  for (const migrationFile of migrationFiles) {
    const sql = await readFile(join(migrationsPath, migrationFile), "utf8");

    await client.query("BEGIN");
    await client.query(sql);
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
