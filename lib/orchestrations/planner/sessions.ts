// Step 7: persists PlannerAgent's PlannerState across chat turns, keyed by
// conversation id. PlannerAgent itself is stateless (see agent.ts's module
// comment) — this is the "chat entry point owns persisting state between
// messages" piece that comment refers to.

import { getPool } from "@/lib/db/pool";
import type { PlannerState } from "./agent";

export async function getPlannerSessionState(conversationId: string): Promise<PlannerState | null> {
  const result = await getPool().query<{ state: PlannerState | null }>(
    `SELECT state FROM ai_planner_sessions WHERE conversation_id = $1`,
    [conversationId]
  );

  return result.rows[0]?.state ?? null;
}

/**
 * Upserts the session row. Passing state: null clears it (used when a
 * PlannerAgent turn resolves to a terminal result) but keeps the row itself
 * — cheap, and avoids a delete/insert race if two requests land close
 * together for the same conversation.
 */
export async function setPlannerSessionState(input: {
  conversationId: string;
  targetAppId: string;
  externalUserId: string;
  state: PlannerState | null;
}): Promise<void> {
  await getPool().query(
    `
      INSERT INTO ai_planner_sessions (conversation_id, target_app_id, external_user_id, state, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, now())
      ON CONFLICT (conversation_id)
      DO UPDATE SET state = EXCLUDED.state, updated_at = now()
    `,
    [
      input.conversationId,
      input.targetAppId,
      input.externalUserId,
      input.state === null ? null : JSON.stringify(input.state),
    ]
  );
}
