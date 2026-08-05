import type { AdminSession } from "@/lib/admin/auth";
import { getPool } from "@/lib/db/pool";

export class RequestScopeError extends Error {
  statusCode: number;

  constructor(message = "Requested scope was not found.", statusCode = 404) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function assertTargetAppScope(
  session: AdminSession,
  targetAppId: string,
): Promise<{ companyId: string; targetAppId: string }> {
  const result = await getPool().query<{ id: string; company_id: string }>(
    `SELECT cta.id, cta.company_id
     FROM company_target_applications cta
     WHERE cta.id = $1
       AND cta.company_id = $2
       AND cta.deleted_at IS NULL
       AND (
         NOT EXISTS (
           SELECT 1
           FROM user_target_app_access any_access
           INNER JOIN company_target_applications scoped
             ON scoped.id = any_access.target_app_id
           WHERE any_access.user_id = $3
             AND any_access.deleted_at IS NULL
             AND scoped.company_id = cta.company_id
         )
         OR EXISTS (
           SELECT 1 FROM user_target_app_access allowed
           WHERE allowed.user_id = $3
             AND allowed.target_app_id = cta.id
             AND allowed.deleted_at IS NULL
         )
       )
     LIMIT 1`,
    [targetAppId, session.user.tenantId, session.user.id],
  );

  if (!result.rows[0]) {
    throw new RequestScopeError();
  }

  return { companyId: result.rows[0].company_id, targetAppId: result.rows[0].id };
}

export async function assertEnvironmentScope(
  session: AdminSession,
  targetAppId: string,
  environmentId: string,
): Promise<{ companyId: string; targetAppId: string; environmentId: string }> {
  const target = await assertTargetAppScope(session, targetAppId);
  const result = await getPool().query<{ id: string }>(
    `SELECT id FROM target_app_environments
     WHERE id = $1 AND target_app_id = $2
     LIMIT 1`,
    [environmentId, targetAppId],
  );

  if (!result.rows[0]) {
    throw new RequestScopeError();
  }

  return { ...target, environmentId: result.rows[0].id };
}
