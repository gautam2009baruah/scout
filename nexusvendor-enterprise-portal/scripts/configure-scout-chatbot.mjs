import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

process.chdir(fileURLToPath(new URL("../..", import.meta.url)));
await import("../../scripts/db/load-env.mjs");

const companyId = "f90d8652-d7ac-4cee-93e5-2d6ced72c6e7";
const companyName = "Scout";
const targetAppName = "NexusVendor Enterprise Portal";
const keyName = "NexusVendor external ScoutChatbot";
const secret = `sk_browser_nexus_${randomBytes(32).toString("base64url")}`;
const prefix = secret.slice(0, 20);
const keyHash = createHash("sha256").update(secret).digest("hex");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
let userId;
let targetAppId;
try {
  await client.query("BEGIN");
  const userResult = await client.query(
    `SELECT users.id
     FROM users
     INNER JOIN user_company_roles ON user_company_roles.user_id = users.id
     WHERE user_company_roles.company_id = $1
       AND user_company_roles.deleted_at IS NULL
       AND user_company_roles.status = 'active'
       AND users.deleted_at IS NULL
       AND users.status = 'active'
       AND users.can_view_chatbot = true
     ORDER BY users.created_at ASC
     LIMIT 1`,
    [companyId]
  );
  userId = userResult.rows[0]?.id;
  if (!userId) throw new Error("No active company user with chatbot access was found.");

  const createdApp = await client.query(
    `INSERT INTO company_target_applications (company_id, name, base_url, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (company_id, lower(name)) WHERE deleted_at IS NULL
     DO UPDATE SET base_url = EXCLUDED.base_url, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id`,
    [companyId, targetAppName, "http://localhost:4173", userId]
  );
  targetAppId = createdApp.rows[0].id;

  const scopedAccess = await client.query(
    `SELECT 1 FROM user_target_app_access
     INNER JOIN company_target_applications ON company_target_applications.id = user_target_app_access.target_app_id
     WHERE user_target_app_access.user_id = $1
       AND user_target_app_access.deleted_at IS NULL
       AND company_target_applications.company_id = $2
     LIMIT 1`,
    [userId, companyId]
  );
  if (scopedAccess.rowCount) {
    await client.query(
      `INSERT INTO user_target_app_access (user_id, target_app_id, created_by, updated_by)
       VALUES ($1, $2, $1, $1)
       ON CONFLICT (user_id, target_app_id) DO UPDATE
       SET deleted_at = NULL, deleted_by = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [userId, targetAppId]
    );
  }

  await client.query(
    "UPDATE chatbot_api_keys SET is_active = false, updated_at = now() WHERE company_id = $1 AND name = $2 AND is_active = true",
    [companyId, keyName]
  );
  await client.query(
    `INSERT INTO chatbot_api_keys (company_id, name, key_prefix, key_hash)
     VALUES ($1, $2, $3, $4)`,
    [companyId, keyName, prefix, keyHash]
  );
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

const config = {
  scoutUrl: "http://localhost:3000",
  apiUrl: "http://localhost:4200",
  apiKey: secret,
  companyId,
  companyName,
  userId,
  targetAppId,
  targetAppName,
  assistantName: "Scout Assistant",
  brandColor: "#111827",
  accentColor: "#0ea5e9"
};
await writeFile(
  new URL("../scout-chatbot-config.local.js", import.meta.url),
  `window.NexusVendorScoutChatbotConfig = ${JSON.stringify(config, null, 2)};\n`,
  { encoding: "utf8", mode: 0o600 }
);
console.log(`Configured the shared ScoutChatbot with key ${prefix}… for target app ${targetAppName}.`);
