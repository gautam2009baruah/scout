export type ExternalUserAccessResult = {
  allowed: boolean;
  permissions: "unvalidated";
};

/**
 * TEMPORARY STUB — external_user_id has no real permission system behind it yet.
 *
 * external_user_id is an opaque, client-supplied identifier (see chatbot config
 * `userId` passed by the embedding host app). It is not validated against any
 * access-control system today and has no mapping to the internal control-panel
 * `users.id` space — those are deliberately separate identities (control-panel
 * users are company employees with role_id/password_hash; external_user_id is a
 * free-text audit column with no FK, see db/migrations/116_chatbot_external_user_columns.sql).
 *
 * This function is the single seam every access decision for external users
 * should call through (AI Planner matching/drafting, notification routing,
 * pending-request locks, etc.) so that when the client's real access-management
 * API is integrated, swapping the implementation here is a one-file change
 * instead of a hunt through every call site.
 *
 * Until that real implementation lands, this always returns unvalidated access —
 * do NOT add real permission logic here piecemeal.
 *
 * Step 8: because this is a no-op, it is NOT itself a safety control today.
 * Until it's replaced with a real implementation, the only actual safety
 * controls gating the AI Planner feature are (1) matchable_without_validation
 * on orchestrations — an admin must explicitly opt an orchestration in
 * before it can be auto-matched and run for an unvalidated external user
 * (see lib/orchestrations/planner/matching.ts), and (2) admin-only drafting
 * approval — every drafted plan goes through the Step 7b review queue before
 * it ever runs (see lib/orchestrations/planner/pending-requests.ts). Do not
 * treat a call to this function as proof that a request is safe.
 */
export async function checkExternalUserAccess(
  externalUserId: string,
  resource: string
): Promise<ExternalUserAccessResult> {
  return { allowed: true, permissions: "unvalidated" };
}
