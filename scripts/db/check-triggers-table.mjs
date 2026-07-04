import pg from "pg";
import "./load-env.mjs";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

try {
  console.log("Checking orchestration_triggers table structure...\n");
  
  const result = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'orchestration_triggers'
    ORDER BY ordinal_position;
  `);
  
  if (result.rows.length === 0) {
    console.log("❌ Table orchestration_triggers does not exist");
  } else {
    console.log("✅ Table exists with columns:");
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    });
  }
  
} catch (error) {
  console.error("Error:", error.message);
} finally {
  await client.end();
}
