// A chatbot is always scoped to exactly one target app (never run at the
// company level), so the target app is the authoritative source of tenant
// identity for chat-triggered orchestrations. Derive companyId from it.

import { getPool } from "@/lib/db/pool";

export async function resolveCompanyIdForTargetApp(targetAppId: string): Promise<string> {
  const result = await getPool().query<{ company_id: string }>(
    `SELECT company_id FROM company_target_applications WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [targetAppId]
  );
  return result.rows[0]?.company_id || "";
}
