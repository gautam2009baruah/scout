// Run cleanup script for broken trigger tables
import { readFile } from "node:fs/promises";
import pg from "pg";
import "./load-env.mjs";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  console.log("🧹 Running cleanup script...");
  
  await client.connect();
  
  const sql = await readFile("db/migrations/000_cleanup_broken_triggers.sql", "utf8");
  
  await client.query(sql);
  
  console.log("✅ Cleanup complete!");
  console.log("Now run: npm run db:migrate");
  
} catch (error) {
  console.error("❌ Cleanup failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
