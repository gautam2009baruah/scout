import { getPool, withPoolRetry } from "@/lib/db/pool";
import { generateGuideFromRecording } from "@/lib/guided-workflows/guide-generator";
import type { Guide, GuideStatus, GuideStep, RecordedAction } from "@/shared/guideTypes";
import type { AdminSession } from "./auth";
import crypto from "node:crypto";

export type GuidedWorkflowRow = Guide & {
  companyId: string;
  companyName: string;
  targetAppId: string | null;
  targetAppName: string | null;
  recordingSessionId: string | null;
  recordedActions: RecordedAction[];
  createdByName: string | null;
};

export type GuidedWorkflowTargetAppRow = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  baseUrl: string;
  allowedOrigins: string[];
  playerConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type GuidedWorkflowRecordingSessionRow = {
  id: string;
  companyId: string;
  companyName: string;
  targetAppId: string | null;
  targetAppName: string | null;
  guideId: string | null;
  recorderConfig: { recorderToken?: string } | null;
  title: string;
  status: "ready" | "recording" | "paused" | "stopped" | "converted";
  actionsCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
};

export class GuidedWorkflowError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GuidedWorkflowError";
    this.statusCode = statusCode;
  }
}

function mapGuide(row: {
  id: string;
  company_id: string;
  company_name: string;
  title: string;
  description: string;
  status: GuideStatus;
  recorded_actions_json: RecordedAction[];
  steps_json: GuideStep[];
  target_app_id: string | null;
  target_app_name: string | null;
  recording_session_id: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}): GuidedWorkflowRow {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    recordingSessionId: row.recording_session_id,
    title: row.title,
    description: row.description,
    status: row.status,
    recordedActions: row.recorded_actions_json ?? [],
    steps: row.steps_json ?? [],
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function assertCompanyAccess(companyId: string, session: AdminSession) {
  if (!companyId) {
    throw new GuidedWorkflowError("Company is required.");
  }

  if (session.user.isAdminRole) {
    return;
  }

  const result = await withPoolRetry(() =>
    getPool().query<{ allowed: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM companies
          WHERE companies.id = $1
            AND companies.deleted_at IS NULL
            AND (
              companies.id = $2
              OR EXISTS (
                SELECT 1
                FROM user_company_roles
                WHERE user_company_roles.user_id = $3
                  AND user_company_roles.company_id = companies.id
                  AND user_company_roles.deleted_at IS NULL
              )
            )
        ) AS allowed
      `,
      [companyId, session.user.tenantId, session.user.id]
    )
  );

  if (!result.rows[0]?.allowed) {
    throw new GuidedWorkflowError("You do not have access to this company.", 403);
  }
}

function accessCondition(session: AdminSession, params: unknown[]) {
  if (session.user.isAdminRole) {
    return "";
  }

  params.push(session.user.tenantId, session.user.id);
  const tenantParam = params.length - 1;
  const userParam = params.length;

  return `
    AND (
      guided_workflow_guides.company_id = $${tenantParam}
      OR EXISTS (
        SELECT 1
        FROM user_company_roles
        WHERE user_company_roles.user_id = $${userParam}
          AND user_company_roles.company_id = guided_workflow_guides.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )
  `;
}

const guideSelect = `
  SELECT
    guided_workflow_guides.id,
    guided_workflow_guides.company_id,
    companies.name AS company_name,
    guided_workflow_guides.target_app_id,
    guided_workflow_target_apps.name AS target_app_name,
    guided_workflow_guides.recording_session_id,
    guided_workflow_guides.title,
    guided_workflow_guides.description,
    guided_workflow_guides.status,
    guided_workflow_guides.recorded_actions_json,
    guided_workflow_guides.steps_json,
    users.name AS created_by_name,
    guided_workflow_guides.created_at,
    guided_workflow_guides.updated_at
  FROM guided_workflow_guides
  INNER JOIN companies ON companies.id = guided_workflow_guides.company_id
  LEFT JOIN guided_workflow_target_apps ON guided_workflow_target_apps.id = guided_workflow_guides.target_app_id
  LEFT JOIN users ON users.id = guided_workflow_guides.created_by
`;

const targetAppSelect = `
  SELECT
    guided_workflow_target_apps.id,
    guided_workflow_target_apps.company_id,
    companies.name AS company_name,
    guided_workflow_target_apps.name,
    guided_workflow_target_apps.base_url,
    guided_workflow_target_apps.allowed_origins_json,
    guided_workflow_target_apps.player_config_json,
    guided_workflow_target_apps.created_at,
    guided_workflow_target_apps.updated_at
  FROM guided_workflow_target_apps
  INNER JOIN companies ON companies.id = guided_workflow_target_apps.company_id
`;

const recordingSessionSelect = `
  SELECT
    guided_workflow_recording_sessions.id,
    guided_workflow_recording_sessions.company_id,
    companies.name AS company_name,
    guided_workflow_recording_sessions.target_app_id,
    guided_workflow_target_apps.name AS target_app_name,
    guided_workflow_recording_sessions.guide_id,
    guided_workflow_recording_sessions.recorder_config_json,
    guided_workflow_recording_sessions.title,
    guided_workflow_recording_sessions.status,
    (
      SELECT COUNT(*)::int
      FROM guided_workflow_recorded_actions
      WHERE guided_workflow_recorded_actions.recording_session_id = guided_workflow_recording_sessions.id
    ) AS actions_count,
    guided_workflow_recording_sessions.started_at,
    guided_workflow_recording_sessions.stopped_at,
    guided_workflow_recording_sessions.created_at,
    guided_workflow_recording_sessions.updated_at
  FROM guided_workflow_recording_sessions
  INNER JOIN companies ON companies.id = guided_workflow_recording_sessions.company_id
  LEFT JOIN guided_workflow_target_apps ON guided_workflow_target_apps.id = guided_workflow_recording_sessions.target_app_id
`;

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRecorderToken() {
  return `sgr_${crypto.randomBytes(24).toString("base64url")}`;
}

function mapTargetApp(row: {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  base_url: string;
  allowed_origins_json: string[];
  player_config_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}): GuidedWorkflowTargetAppRow {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    name: row.name,
    baseUrl: row.base_url,
    allowedOrigins: row.allowed_origins_json ?? [],
    playerConfig: row.player_config_json ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapRecordingSession(row: {
  id: string;
  company_id: string;
  company_name: string;
  target_app_id: string | null;
  target_app_name: string | null;
  guide_id: string | null;
  recorder_config_json: { recorderToken?: string } | null;
  title: string;
  status: GuidedWorkflowRecordingSessionRow["status"];
  actions_count: number;
  started_at: Date | null;
  stopped_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): GuidedWorkflowRecordingSessionRow {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    guideId: row.guide_id,
    recorderConfig: row.recorder_config_json ?? null,
    title: row.title,
    status: row.status,
    actionsCount: Number(row.actions_count),
    startedAt: row.started_at?.toISOString() ?? null,
    stoppedAt: row.stopped_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function listGuidedWorkflows(session: AdminSession) {
  const params: unknown[] = [];
  const access = accessCondition(session, params);
  const result = await withPoolRetry(() =>
    getPool().query(
      `
        ${guideSelect}
        WHERE companies.deleted_at IS NULL
          ${access}
        ORDER BY guided_workflow_guides.updated_at DESC
      `,
      params
    )
  );

  return result.rows.map(mapGuide);
}

export async function listGuidedWorkflowTargetApps(session: AdminSession) {
  const params: unknown[] = [];
  const access = session.user.isAdminRole ? "" : `
    AND (
      guided_workflow_target_apps.company_id = $1
      OR EXISTS (
        SELECT 1
        FROM user_company_roles
        WHERE user_company_roles.user_id = $2
          AND user_company_roles.company_id = guided_workflow_target_apps.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )
  `;

  if (!session.user.isAdminRole) {
    params.push(session.user.tenantId, session.user.id);
  }

  const result = await withPoolRetry(() =>
    getPool().query(
      `
        ${targetAppSelect}
        WHERE companies.deleted_at IS NULL
          ${access}
        ORDER BY companies.name ASC, guided_workflow_target_apps.name ASC
      `,
      params
    )
  );

  return result.rows.map(mapTargetApp);
}

export async function createGuidedWorkflowTargetApp(input: {
  companyId: string;
  name: string;
  baseUrl?: string;
  allowedOrigins?: string[];
  playerConfig?: Record<string, unknown>;
}, session: AdminSession) {
  await assertCompanyAccess(input.companyId, session);
  const name = input.name.trim();

  if (!name) {
    throw new GuidedWorkflowError("Target app name is required.");
  }

  const result = await withPoolRetry(() =>
    getPool().query<{ id: string }>(
      `
        INSERT INTO guided_workflow_target_apps (
          company_id,
          name,
          base_url,
          allowed_origins_json,
          player_config_json,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6)
        RETURNING id
      `,
      [
        input.companyId,
        name,
        input.baseUrl?.trim() || "",
        JSON.stringify(input.allowedOrigins ?? []),
        JSON.stringify(input.playerConfig ?? {}),
        session.user.id
      ]
    )
  );

  const apps = await listGuidedWorkflowTargetApps(session);
  return apps.find((app) => app.id === result.rows[0].id)!;
}

export async function listGuidedWorkflowRecordingSessions(session: AdminSession) {
  const params: unknown[] = [];
  const access = session.user.isAdminRole ? "" : `
    AND (
      guided_workflow_recording_sessions.company_id = $1
      OR EXISTS (
        SELECT 1
        FROM user_company_roles
        WHERE user_company_roles.user_id = $2
          AND user_company_roles.company_id = guided_workflow_recording_sessions.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )
  `;

  if (!session.user.isAdminRole) {
    params.push(session.user.tenantId, session.user.id);
  }

  const result = await withPoolRetry(() =>
    getPool().query(
      `
        ${recordingSessionSelect}
        WHERE companies.deleted_at IS NULL
          ${access}
        ORDER BY guided_workflow_recording_sessions.updated_at DESC
      `,
      params
    )
  );

  return result.rows.map(mapRecordingSession);
}

export async function createGuidedWorkflowRecordingSession(input: {
  companyId: string;
  targetAppId?: string;
  title: string;
}, session: AdminSession) {
  await assertCompanyAccess(input.companyId, session);
  const title = input.title.trim();

  if (!title) {
    throw new GuidedWorkflowError("Recording session title is required.");
  }

  if (input.targetAppId) {
    const apps = await listGuidedWorkflowTargetApps(session);
    const app = apps.find((item) => item.id === input.targetAppId);

    if (!app || app.companyId !== input.companyId) {
      throw new GuidedWorkflowError("Target app was not found for this company.", 404);
    }
  }

  const recorderToken = createRecorderToken();
  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO guided_workflow_recording_sessions (
        company_id,
        target_app_id,
        title,
        recorder_token_hash,
        recorder_config_json,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6)
      RETURNING id
    `,
    [input.companyId, input.targetAppId || null, title, tokenHash(recorderToken), JSON.stringify({ recorderToken }), session.user.id]
  );
  const sessions = await listGuidedWorkflowRecordingSessions(session);

  return {
    session: sessions.find((item) => item.id === result.rows[0].id)!,
    recorderToken
  };
}

export async function updateGuidedWorkflowRecordingSession(id: string, input: {
  status?: GuidedWorkflowRecordingSessionRow["status"];
  title?: string;
}, session: AdminSession) {
  await getGuidedWorkflowRecordingSessionById(id, session);
  const fields = ["updated_by = $2", "updated_at = now()"];
  const params: unknown[] = [id, session.user.id];

  if (input.status) {
    if (!["ready", "recording", "paused", "stopped", "converted"].includes(input.status)) {
      throw new GuidedWorkflowError("Invalid recording status.");
    }

    params.push(input.status);
    fields.push(`status = $${params.length}::guided_workflow_recording_status`);
    if (input.status === "recording") fields.push("started_at = COALESCE(started_at, now())");
    if (input.status === "stopped") fields.push("stopped_at = now()");
  }

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) {
      throw new GuidedWorkflowError("Recording session title is required.");
    }

    params.push(title);
    fields.push(`title = $${params.length}`);
  }

  await getPool().query(`UPDATE guided_workflow_recording_sessions SET ${fields.join(", ")} WHERE id = $1`, params);
  return getGuidedWorkflowRecordingSessionById(id, session);
}

export async function deleteGuidedWorkflowRecordingSession(id: string, session: AdminSession) {
  const recordingSession = await getGuidedWorkflowRecordingSessionById(id, session);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("UPDATE guided_workflow_recording_sessions SET guide_id = NULL WHERE id = $1", [id]);
    if (recordingSession.guideId) {
      await client.query("DELETE FROM guided_workflow_guides WHERE id = $1", [recordingSession.guideId]);
    }
    await client.query("DELETE FROM guided_workflow_recording_sessions WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getGuidedWorkflowRecordingSessionById(id: string, session: AdminSession) {
  const params: unknown[] = [id];
  const access = session.user.isAdminRole ? "" : `
    AND (
      guided_workflow_recording_sessions.company_id = $2
      OR EXISTS (
        SELECT 1
        FROM user_company_roles
        WHERE user_company_roles.user_id = $3
          AND user_company_roles.company_id = guided_workflow_recording_sessions.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )
  `;

  if (!session.user.isAdminRole) {
    params.push(session.user.tenantId, session.user.id);
  }

  const result = await getPool().query(
    `
      ${recordingSessionSelect}
      WHERE guided_workflow_recording_sessions.id = $1
        ${access}
    `,
    params
  );

  if (!result.rows[0]) {
    throw new GuidedWorkflowError("Recording session was not found.", 404);
  }

  return mapRecordingSession(result.rows[0]);
}

export async function listRecordedActionsForSession(sessionId: string, session: AdminSession) {
  await getGuidedWorkflowRecordingSessionById(sessionId, session);
  const result = await getPool().query<{ action_json: RecordedAction }>(
    `
      SELECT action_json
      FROM guided_workflow_recorded_actions
      WHERE recording_session_id = $1
      ORDER BY action_index ASC
    `,
    [sessionId]
  );

  return result.rows.map((row) => row.action_json);
}

export async function appendRecordedActionByToken(token: string, action: RecordedAction, origin?: string) {
  if (!token || !action || typeof action !== "object") {
    throw new GuidedWorkflowError("Recorder token and action are required.");
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const sessionResult = await client.query<{
      id: string;
      company_id: string;
      target_app_id: string | null;
      guide_id: string | null;
      title: string;
      status: GuidedWorkflowRecordingSessionRow["status"];
      actions_count: number;
      next_action_index: number;
      allowed_origins_json: string[] | null;
    }>(
      `
        SELECT
          guided_workflow_recording_sessions.id,
          guided_workflow_recording_sessions.company_id,
          guided_workflow_recording_sessions.target_app_id,
          guided_workflow_recording_sessions.guide_id,
          guided_workflow_recording_sessions.title,
          guided_workflow_recording_sessions.status,
          (
            SELECT COUNT(*)::int
            FROM guided_workflow_recorded_actions
            WHERE guided_workflow_recorded_actions.recording_session_id = guided_workflow_recording_sessions.id
          ) AS actions_count,
          (
            SELECT COALESCE(MAX(action_index) + 1, 0)::int
            FROM guided_workflow_recorded_actions
            WHERE guided_workflow_recorded_actions.recording_session_id = guided_workflow_recording_sessions.id
          ) AS next_action_index,
          guided_workflow_target_apps.allowed_origins_json
        FROM guided_workflow_recording_sessions
        LEFT JOIN guided_workflow_target_apps ON guided_workflow_target_apps.id = guided_workflow_recording_sessions.target_app_id
        WHERE guided_workflow_recording_sessions.recorder_token_hash = $1
        FOR UPDATE OF guided_workflow_recording_sessions
      `,
      [tokenHash(token)]
    );
    const recordingSession = sessionResult.rows[0];

    if (!recordingSession) {
      throw new GuidedWorkflowError("Recording session was not found.", 404);
    }

    const allowedOrigins = recordingSession.allowed_origins_json ?? [];

    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      throw new GuidedWorkflowError("This origin is not allowed for the recording session.", 403);
    }

    const nextIndex = Number(recordingSession.next_action_index);
    await client.query(
      `
        INSERT INTO guided_workflow_recorded_actions (
          company_id,
          recording_session_id,
          action_index,
          action_json
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [recordingSession.company_id, recordingSession.id, nextIndex, JSON.stringify(action)]
    );
    await client.query(
      `
        UPDATE guided_workflow_recording_sessions
        SET status = CASE WHEN status = 'ready' THEN 'recording' ELSE status END,
            started_at = COALESCE(started_at, now()),
            actions_count = actions_count + 1,
            updated_at = now()
        WHERE id = $1
      `,
      [recordingSession.id]
    );

    if (recordingSession.guide_id) {
      const guideResult = await client.query<{
        recorded_actions_json: RecordedAction[] | null;
        steps_json: GuideStep[] | null;
      }>(
        `
          SELECT recorded_actions_json, steps_json
          FROM guided_workflow_guides
          WHERE id = $1
          FOR UPDATE
        `,
        [recordingSession.guide_id]
      );
      const guide = guideResult.rows[0];

      if (guide) {
        const existingRecordedActions = guide.recorded_actions_json ?? [];
        const existingSteps = guide.steps_json ?? [];
        const currentStepSourceIds = new Set(existingSteps.map((step) => step.actionSourceId).filter(Boolean));
        const removedSourceIds = new Set(
          existingRecordedActions
            .map((recordedAction) => recordedAction.id)
            .filter((actionId) => actionId && !currentStepSourceIds.has(actionId))
        );
        const nextRecordedActions = [...existingRecordedActions, action];

        if (!removedSourceIds.has(action.id) && !currentStepSourceIds.has(action.id)) {
          const generated = generateGuideFromRecording([action]);
          const nextSteps = [...existingSteps, ...generated.steps].map((step, index) => ({ ...step, order: index + 1 }));

          await client.query(
            `
              UPDATE guided_workflow_guides
              SET recorded_actions_json = $2::jsonb,
                  steps_json = $3::jsonb,
                  status = CASE WHEN status = 'published' THEN 'draft' ELSE status END,
                  updated_at = now()
              WHERE id = $1
            `,
            [recordingSession.guide_id, JSON.stringify(nextRecordedActions), JSON.stringify(nextSteps)]
          );
        } else {
          await client.query(
            `
              UPDATE guided_workflow_guides
              SET recorded_actions_json = $2::jsonb,
                  updated_at = now()
              WHERE id = $1
            `,
            [recordingSession.guide_id, JSON.stringify(nextRecordedActions)]
          );
        }
      }
    } else {
      const generated = generateGuideFromRecording([action], { title: recordingSession.title });
      const guideResult = await client.query<{ id: string }>(
        `
          INSERT INTO guided_workflow_guides (
            company_id,
            target_app_id,
            recording_session_id,
            title,
            description,
            status,
            recorded_actions_json,
            steps_json
          )
          VALUES ($1, $2, $3, $4, $5, 'draft', $6::jsonb, $7::jsonb)
          RETURNING id
        `,
        [
          recordingSession.company_id,
          recordingSession.target_app_id,
          recordingSession.id,
          generated.title,
          generated.description,
          JSON.stringify([action]),
          JSON.stringify(generated.steps)
        ]
      );
      await client.query(
        `
          UPDATE guided_workflow_recording_sessions
          SET guide_id = $2,
              updated_at = now()
          WHERE id = $1
        `,
        [recordingSession.id, guideResult.rows[0].id]
      );
    }
    await client.query("COMMIT");

    return { ok: true, actionIndex: nextIndex };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getGuidedWorkflowById(id: string, session: AdminSession) {
  const params: unknown[] = [id];
  const access = accessCondition(session, params);
  const result = await getPool().query(
    `
      ${guideSelect}
      WHERE guided_workflow_guides.id = $1
        ${access}
    `,
    params
  );
  const row = result.rows[0];

  if (!row) {
    throw new GuidedWorkflowError("Guided workflow was not found.", 404);
  }

  return mapGuide(row);
}

export async function createGuidedWorkflow(input: {
  companyId: string;
  targetAppId?: string | null;
  recordingSessionId?: string | null;
  title?: string;
  description?: string;
  status?: GuideStatus;
  recordedActions?: RecordedAction[];
  steps?: GuideStep[];
}, session: AdminSession) {
  await assertCompanyAccess(input.companyId, session);
  const generated = generateGuideFromRecording(input.recordedActions ?? [], {
    title: input.title,
    description: input.description
  });
  const steps = input.steps ?? generated.steps;

  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO guided_workflow_guides (
        company_id,
        target_app_id,
        recording_session_id,
        title,
        description,
        status,
        recorded_actions_json,
        steps_json,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $9)
      RETURNING id
    `,
    [
      input.companyId,
      input.targetAppId || null,
      input.recordingSessionId || null,
      generated.title,
      generated.description,
      input.status ?? "draft",
      JSON.stringify(input.recordedActions ?? []),
      JSON.stringify(steps),
      session.user.id
    ]
  );

  return getGuidedWorkflowById(result.rows[0].id, session);
}

export async function updateGuidedWorkflow(id: string, input: {
  title?: string;
  description?: string;
  status?: GuideStatus;
  recordedActions?: RecordedAction[];
  steps?: GuideStep[];
}, session: AdminSession) {
  await getGuidedWorkflowById(id, session);
  const fields: string[] = ["updated_by = $2", "updated_at = now()"];
  const params: unknown[] = [id, session.user.id];

  if (typeof input.title === "string") {
    const title = input.title.trim();

    if (!title) {
      throw new GuidedWorkflowError("Guide title is required.");
    }

    params.push(title);
    fields.push(`title = $${params.length}`);
  }

  if (typeof input.description === "string") {
    params.push(input.description.trim());
    fields.push(`description = $${params.length}`);
  }

  if (input.status) {
    if (!["draft", "published"].includes(input.status)) {
      throw new GuidedWorkflowError("Invalid guide status.");
    }

    params.push(input.status);
    fields.push(`status = $${params.length}`);
    fields.push("published_at = CASE WHEN " + `$${params.length}` + " = 'published' THEN now() ELSE published_at END");
  }

  if (input.recordedActions) {
    params.push(JSON.stringify(input.recordedActions));
    fields.push(`recorded_actions_json = $${params.length}::jsonb`);
  }

  if (input.steps) {
    params.push(JSON.stringify(input.steps));
    fields.push(`steps_json = $${params.length}::jsonb`);
  }

  await getPool().query(
    `
      UPDATE guided_workflow_guides
      SET ${fields.join(", ")}
      WHERE id = $1
    `,
    params
  );

  return getGuidedWorkflowById(id, session);
}

export async function deleteRecordedActionForGuideStep(guideId: string, stepId: string, session: AdminSession) {
  const guide = await getGuidedWorkflowById(guideId, session);
  const step = guide.steps.find((item) => item.id === stepId);

  if (!step) {
    throw new GuidedWorkflowError("Guide step was not found.", 404);
  }

  const nextSteps = guide.steps
    .filter((item) => item.id !== stepId)
    .map((item, index) => ({ ...item, order: index + 1 }));
  const nextRecordedActions = step.actionSourceId
    ? guide.recordedActions.filter((action) => action.id !== step.actionSourceId)
    : guide.recordedActions;

  await getPool().query(
    `
      DELETE FROM guided_workflow_recorded_actions
      WHERE recording_session_id = $1
        AND action_json->>'id' = $2
    `,
    [guide.recordingSessionId, step.actionSourceId]
  );

  return updateGuidedWorkflow(
    guide.id,
    {
      recordedActions: nextRecordedActions,
      steps: nextSteps,
      status: guide.status === "published" ? "draft" : guide.status
    },
    session
  );
}

export async function regenerateGuidedWorkflow(id: string, session: AdminSession) {
  const current = await getGuidedWorkflowById(id, session);
  const generated = generateGuideFromRecording(current.recordedActions, {
    title: current.title,
    description: current.description
  });

  return updateGuidedWorkflow(id, { steps: generated.steps, status: "draft" }, session);
}

export async function createGuideFromRecordingSession(sessionId: string, session: AdminSession) {
  const recordingSession = await getGuidedWorkflowRecordingSessionById(sessionId, session);
  const actions = await listRecordedActionsForSession(sessionId, session);

  if (actions.length === 0) {
    throw new GuidedWorkflowError("Recording session has no actions yet.");
  }

  if (recordingSession.guideId) {
    const currentGuide = await getGuidedWorkflowById(recordingSession.guideId, session);
    const currentStepSourceIds = new Set(currentGuide.steps.map((step) => step.actionSourceId).filter(Boolean));
    const removedSourceIds = new Set(
      currentGuide.recordedActions
        .map((action) => action.id)
        .filter((actionId) => actionId && !currentStepSourceIds.has(actionId))
    );
    const newActions = actions.filter((action) => !removedSourceIds.has(action.id) && !currentStepSourceIds.has(action.id));
    const generated = generateGuideFromRecording(newActions, {
      title: currentGuide.title,
      description: currentGuide.description
    });
    const steps = [...currentGuide.steps, ...generated.steps].map((step, index) => ({ ...step, order: index + 1 }));

    const guide = await updateGuidedWorkflow(
      currentGuide.id,
      {
        recordedActions: actions,
        steps,
        status: "draft"
      },
      session
    );

    await getPool().query(
      `
        UPDATE guided_workflow_recording_sessions
        SET status = 'converted',
            updated_by = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [recordingSession.id, session.user.id]
    );

    return guide;
  }

  const guide = await createGuidedWorkflow(
    {
      companyId: recordingSession.companyId,
      targetAppId: recordingSession.targetAppId,
      recordingSessionId: recordingSession.id,
      title: recordingSession.title,
      recordedActions: actions
    },
    session
  );

  await getPool().query(
    `
      UPDATE guided_workflow_recording_sessions
      SET status = 'converted',
          guide_id = $2,
          stopped_at = COALESCE(stopped_at, now()),
          updated_by = $3,
          updated_at = now()
      WHERE id = $1
    `,
    [recordingSession.id, guide.id, session.user.id]
  );

  return guide;
}

export async function getPublishedGuidesForPlayer(input: { targetAppId: string; origin?: string }) {
  if (!input.targetAppId) {
    throw new GuidedWorkflowError("Target app is required.");
  }

  const appResult = await getPool().query<{ allowed_origins_json: string[] }>(
    `
      SELECT allowed_origins_json
      FROM guided_workflow_target_apps
      WHERE id = $1
    `,
    [input.targetAppId]
  );
  const app = appResult.rows[0];

  if (!app) {
    throw new GuidedWorkflowError("Target app was not found.", 404);
  }

  const allowedOrigins = app.allowed_origins_json ?? [];

  if (input.origin && allowedOrigins.length > 0 && !allowedOrigins.includes(input.origin)) {
    throw new GuidedWorkflowError("This origin is not allowed for this target app.", 403);
  }

  const result = await getPool().query<{
    id: string;
    title: string;
    description: string;
    status: GuideStatus;
    steps_json: GuideStep[];
    created_at: Date;
    updated_at: Date;
  }>(
    `
      SELECT id, title, description, status, steps_json, created_at, updated_at
      FROM guided_workflow_guides
      WHERE target_app_id = $1
        AND status = 'published'
      ORDER BY updated_at DESC
    `,
    [input.targetAppId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    steps: row.steps_json ?? []
  }));
}
