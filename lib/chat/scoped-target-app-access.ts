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
  allowAnonymousGuest?: boolean;
}) {
  if (!input.companyId || !input.targetAppId) {
    throw new ScopedTargetAppAccessError("Company, user, and target app are required.", 400);
  }
  const appExists = await getPool().query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM guided_workflow_target_apps app
       WHERE app.id = $2
         AND app.company_id = $1
     ) AS allowed`,
    [input.companyId, input.targetAppId]
  );

  if (!appExists.rows[0]?.allowed) {
    throw new ScopedTargetAppAccessError("Target app was not found for this company.", 404);
  }
}
