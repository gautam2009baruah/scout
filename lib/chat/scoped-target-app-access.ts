import { getPool } from "@/lib/db/pool";

export class ScopedTargetAppAccessError extends Error {
  constructor(message: string, public readonly statusCode = 403) {
    super(message);
    this.name = "ScopedTargetAppAccessError";
  }
}

export async function assertScopedTargetAppAccess(input: {
  companyId: string;
  userId: string;
  targetAppId: string;
}) {
  if (!input.companyId || !input.userId || !input.targetAppId) {
    throw new ScopedTargetAppAccessError("Company, user, and target app are required.", 400);
  }

  const result = await getPool().query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM users u
       INNER JOIN user_company_roles ucr
         ON ucr.user_id = u.id
        AND ucr.company_id = $1
        AND ucr.deleted_at IS NULL
        AND ucr.status = 'active'
       INNER JOIN guided_workflow_target_apps app
         ON app.id = $3
        AND app.company_id = $1
       WHERE u.id = $2
         AND u.deleted_at IS NULL
         AND u.status = 'active'
         AND u.can_view_chatbot = true
         AND (
           NOT EXISTS (
             SELECT 1
             FROM user_target_app_access company_scope
             INNER JOIN guided_workflow_target_apps scoped_app
               ON scoped_app.id = company_scope.target_app_id
              AND scoped_app.company_id = $1
             WHERE company_scope.user_id = u.id
               AND company_scope.deleted_at IS NULL
           )
           OR EXISTS (
             SELECT 1
             FROM user_target_app_access app_scope
             WHERE app_scope.user_id = u.id
               AND app_scope.target_app_id = $3
               AND app_scope.deleted_at IS NULL
           )
         )
     ) AS allowed`,
    [input.companyId, input.userId, input.targetAppId]
  );

  if (!result.rows[0]?.allowed) {
    throw new ScopedTargetAppAccessError("You do not have access to this target application.");
  }
}
