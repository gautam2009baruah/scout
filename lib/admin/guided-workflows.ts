import { getPool, withPoolRetry } from "@/lib/db/pool";
import { generateGuideFromRecording } from "@/lib/guided-workflows/guide-generator";
import type { Guide, GuideStatus, GuideStep, GuideStepTrigger, RecordedAction } from "@/shared/guideTypes";
import type { AdminSession } from "./auth";
import crypto from "node:crypto";

export type GuidedWorkflowRow = Guide & {
  companyId: string;
  companyName: string;
  targetAppId: string | null;
  targetAppName: string | null;
  recordingSessionId: string | null;
  topicId: string | null;
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
  title: string;
  createdAt: string;
  updatedAt: string;
  topics: GuidedWorkflowTopicRow[];
};

export type GuidedWorkflowTopicRow = {
  id: string;
  companyId: string;
  recordingSessionId: string;
  guideId: string | null;
  recorderConfig: { recorderToken?: string; topicId?: string } | null;
  title: string;
  status: GuideStatus;
  sortOrder: number;
  actionsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PlayerTrainingSession = {
  id: string;
  title: string;
  topics: Array<{
    id: string;
    title: string;
    guideId: string;
    description: string;
    status: GuideStatus;
    actionsCount: number;
    steps: number;
    updatedAt: string;
  }>;
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
  topic_id: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}): GuidedWorkflowRow {
  const recordedActions = row.recorded_actions_json ?? [];
  const actionsById = new Map(recordedActions.map((action) => [action.id, action]));

  return guideWithRuntimeStructure({
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    recordingSessionId: row.recording_session_id,
    topicId: row.topic_id,
    title: row.title,
    description: row.description,
    status: row.status,
    recordedActions,
    steps: (row.steps_json ?? []).map((step) => {
      const source = actionsById.get(step.actionSourceId);
      const stepPurpose = step.stepPurpose ?? source?.stepPurpose ?? "main";

      return {
        ...step,
        stepPurpose,
        navigationMode: stepPurpose === "navigation" ? step.navigationMode ?? source?.navigationMode ?? "waitForUser" : undefined,
        trigger: stepPurpose === "navigation" ? "click" : normalizeGuideStepTrigger(step.trigger ?? source?.trigger)
      };
    }),
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

function normalizeGuideStepTrigger(value: unknown): GuideStepTrigger {
  return value === "change" || value === "blur" || value === "focus" || value === "input" || value === "manualNext" ? value : "click";
}

function normalizeGuideSteps(steps: GuideStep[]) {
  return steps.map((step) => {
    const stepPurpose = step.stepPurpose ?? "main";
    const navigationMode = stepPurpose === "navigation" ? step.navigationMode ?? "waitForUser" : undefined;

    return {
      ...step,
      type: step.type ?? (stepPurpose === "navigation" || step.trigger === "click" ? "click" : step.trigger === "manualNext" ? "manualInstruction" : step.trigger === "input" || step.trigger === "change" || step.trigger === "blur" || step.trigger === "focus" ? "input" : "highlight"),
      stepPurpose,
      navigationMode,
      autoClick: step.autoClick ?? navigationMode === "autoClick",
      trigger: stepPurpose === "navigation" ? "click" : normalizeGuideStepTrigger(step.trigger)
    };
  });
}

function guideWithRuntimeStructure<TGuide extends Guide>(guide: TGuide) {
  const steps = normalizeGuideSteps(guide.steps ?? []);
  const entrySteps = steps.filter((step) => step.stepPurpose === "navigation");
  const mainSteps = steps.filter((step) => step.stepPurpose !== "navigation");
  const firstStep = steps[0];
  const firstMainStep = mainSteps[0];

  return {
    ...guide,
    steps,
    startContext: guide.startContext ?? (firstStep ? { url: firstStep.urlMatch } : undefined),
    goalContext: guide.goalContext ?? (firstMainStep ? { url: firstMainStep.urlMatch, target: firstMainStep.target, requiredElement: firstMainStep.target } : undefined),
    entrySteps: guide.entrySteps ?? entrySteps,
    mainSteps: guide.mainSteps ?? mainSteps
  };
}

function applyGuideStepDetails(recordedActions: RecordedAction[], steps: GuideStep[]) {
  const stepByActionId = new Map<string, GuideStep>();
  const stepOrderByActionId = new Map<string, number>();

  steps.forEach((step, index) => {
    if (!step.actionSourceId) return;
    stepByActionId.set(step.actionSourceId, step);
    stepOrderByActionId.set(step.actionSourceId, index);
  });

  return recordedActions.map((action) => {
    const step = stepByActionId.get(action.id);
    return stripLegacyStepState({
      ...action,
      stepPurpose: step?.stepPurpose ?? action.stepPurpose ?? "main",
      navigationMode: step?.stepPurpose === "navigation" ? step.navigationMode ?? action.navigationMode ?? "waitForUser" : undefined,
      trigger: step?.stepPurpose === "navigation" ? undefined : step?.trigger ?? action.trigger
    });
  }).sort((left, right) => {
    const leftOrder = stepOrderByActionId.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = stepOrderByActionId.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    return leftOrder - rightOrder;
  });
}

function stripLegacyStepState(action: RecordedAction): RecordedAction {
  const {
    guidePhase: _legacyGuidePhase,
    isMainStep: _legacyIsMainStep,
    continueWhen: _legacyContinueWhen,
    ...nextAction
  } = action as RecordedAction & Record<string, unknown>;
  return nextAction as RecordedAction;
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
    guided_workflow_topics.recording_session_id,
    guided_workflow_guides.topic_id,
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
  LEFT JOIN guided_workflow_topics ON guided_workflow_topics.id = guided_workflow_guides.topic_id
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
    guided_workflow_recording_sessions.title,
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
  title: string;
  created_at: Date;
  updated_at: Date;
}, topics: GuidedWorkflowTopicRow[] = []): GuidedWorkflowRecordingSessionRow {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    topics
  };
}

function mapTopic(row: {
  id: string;
  company_id: string;
  recording_session_id: string;
  guide_id: string | null;
  recorder_config_json: { recorderToken?: string; topicId?: string } | null;
  title: string;
  status: GuideStatus | null;
  sort_order: number;
  actions_count: number;
  created_at: Date;
  updated_at: Date;
}): GuidedWorkflowTopicRow {
  return {
    id: row.id,
    companyId: row.company_id,
    recordingSessionId: row.recording_session_id,
    guideId: row.guide_id,
    recorderConfig: row.recorder_config_json ?? null,
    title: row.title,
    status: row.status ?? "draft",
    sortOrder: Number(row.sort_order),
    actionsCount: Number(row.actions_count),
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

  const topics = await listGuidedWorkflowTopics(session);
  const topicsBySession = new Map<string, GuidedWorkflowTopicRow[]>();
  topics.forEach((topic) => {
    topicsBySession.set(topic.recordingSessionId, [...(topicsBySession.get(topic.recordingSessionId) ?? []), topic]);
  });

  return result.rows.map((row) => mapRecordingSession(row, topicsBySession.get(row.id) ?? []));
}

export async function listGuidedWorkflowTopics(session: AdminSession) {
  const params: unknown[] = [];
  const access = session.user.isAdminRole ? "" : `
    AND (
      guided_workflow_topics.company_id = $1
      OR EXISTS (
        SELECT 1
        FROM user_company_roles
        WHERE user_company_roles.user_id = $2
          AND user_company_roles.company_id = guided_workflow_topics.company_id
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
        SELECT
          guided_workflow_topics.id,
          guided_workflow_topics.company_id,
          guided_workflow_topics.recording_session_id,
          guided_workflow_topics.guide_id,
          guided_workflow_topics.recorder_config_json,
          guided_workflow_topics.title,
          guided_workflow_guides.status,
          guided_workflow_topics.sort_order,
          guided_workflow_topics.actions_count,
          guided_workflow_topics.created_at,
          guided_workflow_topics.updated_at
        FROM guided_workflow_topics
        INNER JOIN guided_workflow_recording_sessions ON guided_workflow_recording_sessions.id = guided_workflow_topics.recording_session_id
        INNER JOIN companies ON companies.id = guided_workflow_topics.company_id
        LEFT JOIN guided_workflow_guides ON guided_workflow_guides.id = guided_workflow_topics.guide_id
        WHERE companies.deleted_at IS NULL
          ${access}
        ORDER BY guided_workflow_topics.recording_session_id, guided_workflow_topics.sort_order ASC, guided_workflow_topics.created_at ASC
      `,
      params
    )
  );

  return result.rows.map(mapTopic);
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

  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO guided_workflow_recording_sessions (
        company_id,
        target_app_id,
        title,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $4)
      RETURNING id
    `,
    [input.companyId, input.targetAppId || null, title, session.user.id]
  );
  const sessions = await listGuidedWorkflowRecordingSessions(session);

  return {
    session: sessions.find((item) => item.id === result.rows[0].id)!
  };
}

export async function updateGuidedWorkflowRecordingSession(id: string, input: {
  title?: string;
}, session: AdminSession) {
  await getGuidedWorkflowRecordingSessionById(id, session);
  const fields = ["updated_by = $2", "updated_at = now()"];
  const params: unknown[] = [id, session.user.id];

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
  await getGuidedWorkflowRecordingSessionById(id, session);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM guided_workflow_guides WHERE topic_id IN (SELECT id FROM guided_workflow_topics WHERE recording_session_id = $1)", [id]);
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

  const topics = await listGuidedWorkflowTopics(session);
  return mapRecordingSession(result.rows[0], topics.filter((topic) => topic.recordingSessionId === id));
}

export async function getGuidedWorkflowTopicById(id: string, session: AdminSession) {
  const topics = await listGuidedWorkflowTopics(session);
  const topic = topics.find((item) => item.id === id);
  if (!topic) {
    throw new GuidedWorkflowError("Training topic was not found.", 404);
  }
  return topic;
}

export async function createGuidedWorkflowTopic(input: {
  recordingSessionId: string;
  title: string;
}, session: AdminSession) {
  const recordingSession = await getGuidedWorkflowRecordingSessionById(input.recordingSessionId, session);
  const title = input.title.trim();

  if (!title) {
    throw new GuidedWorkflowError("Topic title is required.");
  }

  const recorderToken = createRecorderToken();
  const orderResult = await getPool().query<{ next_order: number }>(
    "SELECT COALESCE(MAX(sort_order) + 1, 0)::int AS next_order FROM guided_workflow_topics WHERE recording_session_id = $1",
    [recordingSession.id]
  );
  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO guided_workflow_topics (
        company_id,
        recording_session_id,
        title,
        sort_order,
        recorder_token_hash,
        recorder_config_json,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $7)
      RETURNING id
    `,
    [
      recordingSession.companyId,
      recordingSession.id,
      title,
      orderResult.rows[0]?.next_order ?? 0,
      tokenHash(recorderToken),
      JSON.stringify({ recorderToken, topicId: "" }),
      session.user.id
    ]
  );
  await getPool().query(
    `
      UPDATE guided_workflow_topics
      SET recorder_config_json = jsonb_set(recorder_config_json, '{topicId}', to_jsonb(id::text), true)
      WHERE id = $1
    `,
    [result.rows[0].id]
  );

  return getGuidedWorkflowTopicById(result.rows[0].id, session);
}

export async function updateGuidedWorkflowTopic(id: string, input: {
  title?: string;
  move?: "up" | "down";
}, session: AdminSession) {
  const topic = await getGuidedWorkflowTopicById(id, session);

  if (typeof input.title === "string") {
    const title = input.title.trim();
    if (!title) throw new GuidedWorkflowError("Topic title is required.");
    await getPool().query(
      "UPDATE guided_workflow_topics SET title = $2, updated_by = $3, updated_at = now() WHERE id = $1",
      [id, title, session.user.id]
    );
  }

  if (input.move) {
    const direction = input.move === "up" ? -1 : 1;
    const topics = (await listGuidedWorkflowTopics(session)).filter((item) => item.recordingSessionId === topic.recordingSessionId);
    const index = topics.findIndex((item) => item.id === id);
    const other = topics[index + direction];
    if (other) {
      await getPool().query("UPDATE guided_workflow_topics SET sort_order = $2, updated_at = now() WHERE id = $1", [topic.id, other.sortOrder]);
      await getPool().query("UPDATE guided_workflow_topics SET sort_order = $2, updated_at = now() WHERE id = $1", [other.id, topic.sortOrder]);
    }
  }

  return getGuidedWorkflowTopicById(id, session);
}

export async function deleteGuidedWorkflowTopic(id: string, session: AdminSession) {
  const topic = await getGuidedWorkflowTopicById(id, session);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    if (topic.guideId) {
      await client.query("DELETE FROM guided_workflow_guides WHERE id = $1", [topic.guideId]);
    }
    await client.query("DELETE FROM guided_workflow_topics WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

  return result.rows.map((row) => stripLegacyStepState(row.action_json));
}

export async function listRecordedActionsForTopic(topicId: string, session: AdminSession) {
  await getGuidedWorkflowTopicById(topicId, session);
  const result = await getPool().query<{ action_json: RecordedAction }>(
    `
      SELECT action_json
      FROM guided_workflow_recorded_actions
      WHERE topic_id = $1
      ORDER BY action_index ASC
    `,
    [topicId]
  );

  return result.rows.map((row) => stripLegacyStepState(row.action_json));
}

export async function appendRecordedActionByToken(token: string, action: RecordedAction, origin?: string) {
  if (!token || !action || typeof action !== "object") {
    throw new GuidedWorkflowError("Recorder token and action are required.");
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const topicResult = await client.query<{
      id: string;
      company_id: string;
      recording_session_id: string;
      target_app_id: string | null;
      guide_id: string | null;
      title: string;
      actions_count: number;
      next_action_index: number;
      allowed_origins_json: string[] | null;
    }>(
      `
        SELECT
          guided_workflow_topics.id,
          guided_workflow_topics.company_id,
          guided_workflow_topics.recording_session_id,
          guided_workflow_recording_sessions.target_app_id,
          guided_workflow_topics.guide_id,
          guided_workflow_topics.title,
          (
            SELECT COUNT(*)::int
            FROM guided_workflow_recorded_actions
            WHERE guided_workflow_recorded_actions.topic_id = guided_workflow_topics.id
          ) AS actions_count,
          (
            SELECT COALESCE(MAX(action_index) + 1, 0)::int
            FROM guided_workflow_recorded_actions
            WHERE guided_workflow_recorded_actions.recording_session_id = guided_workflow_topics.recording_session_id
          ) AS next_action_index,
          guided_workflow_target_apps.allowed_origins_json
        FROM guided_workflow_topics
        INNER JOIN guided_workflow_recording_sessions ON guided_workflow_recording_sessions.id = guided_workflow_topics.recording_session_id
        LEFT JOIN guided_workflow_target_apps ON guided_workflow_target_apps.id = guided_workflow_recording_sessions.target_app_id
        WHERE guided_workflow_topics.recorder_token_hash = $1
        FOR UPDATE OF guided_workflow_topics
      `,
      [tokenHash(token)]
    );
    const topic = topicResult.rows[0];

    if (!topic) {
      throw new GuidedWorkflowError("Training topic was not found.", 404);
    }

    const allowedOrigins = topic.allowed_origins_json ?? [];

    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      throw new GuidedWorkflowError("This origin is not allowed for the recording session.", 403);
    }

    const nextIndex = Number(topic.next_action_index);
    const cleanAction: RecordedAction = stripLegacyStepState(action);
    await client.query(
      `
        INSERT INTO guided_workflow_recorded_actions (
          company_id,
          recording_session_id,
          topic_id,
          action_index,
          action_json
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [topic.company_id, topic.recording_session_id, topic.id, nextIndex, JSON.stringify(cleanAction)]
    );
    await client.query(
      `
        UPDATE guided_workflow_topics
        SET actions_count = actions_count + 1,
            updated_at = now()
        WHERE id = $1
      `,
      [topic.id]
    );

    if (topic.guide_id) {
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
        [topic.guide_id]
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
        const nextRecordedActions = [...existingRecordedActions, cleanAction];

        if (!removedSourceIds.has(cleanAction.id) && !currentStepSourceIds.has(cleanAction.id)) {
          const generated = generateGuideFromRecording([cleanAction]);
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
            [topic.guide_id, JSON.stringify(nextRecordedActions), JSON.stringify(nextSteps)]
          );
        } else {
          await client.query(
            `
              UPDATE guided_workflow_guides
              SET recorded_actions_json = $2::jsonb,
                  updated_at = now()
              WHERE id = $1
            `,
            [topic.guide_id, JSON.stringify(nextRecordedActions)]
          );
        }
      }
    } else {
      const generated = generateGuideFromRecording([cleanAction], { title: topic.title });
      const guideResult = await client.query<{ id: string }>(
        `
          INSERT INTO guided_workflow_guides (
            company_id,
            target_app_id,
            topic_id,
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
          topic.company_id,
          topic.target_app_id,
          topic.id,
          generated.title,
          generated.description,
          JSON.stringify([cleanAction]),
          JSON.stringify(generated.steps)
        ]
      );
      await client.query(
        `
          UPDATE guided_workflow_topics
          SET guide_id = $2,
              updated_at = now()
          WHERE id = $1
        `,
        [topic.id, guideResult.rows[0].id]
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
  topicId?: string | null;
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
        topic_id,
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
      input.topicId || null,
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
  const currentGuide = await getGuidedWorkflowById(id, session);
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

  const recordedActions = input.steps
    ? applyGuideStepDetails(input.recordedActions ?? currentGuide.recordedActions, input.steps)
    : input.recordedActions;

  if (recordedActions) {
    params.push(JSON.stringify(recordedActions));
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

  if (input.steps && currentGuide.topicId && recordedActions) {
    const actionRows = recordedActions
      .map((action, index) => ({
        action,
        actionIndex: index
      }))
      .filter(({ action }) => Boolean(action.id));
    const temporaryIndexOffset = actionRows.length + 100000;

    await Promise.all(actionRows.map(({ action, actionIndex }) =>
      getPool().query(
        `
          UPDATE guided_workflow_recorded_actions
          SET action_index = $3
          WHERE topic_id = $1
            AND action_json->>'id' = $2
        `,
        [currentGuide.topicId, action.id, temporaryIndexOffset + actionIndex]
      )
    ));

    await Promise.all(actionRows.map(({ action, actionIndex }) =>
      getPool().query(
        `
          UPDATE guided_workflow_recorded_actions
          SET action_index = $3,
              action_json = $4::jsonb
          WHERE topic_id = $1
            AND action_json->>'id' = $2
        `,
        [
          currentGuide.topicId,
          action.id,
          actionIndex,
          JSON.stringify(action)
        ]
      )
    ));
  }

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
      WHERE topic_id = $1
        AND action_json->>'id' = $2
    `,
    [guide.topicId, step.actionSourceId]
  );

  const updatedGuide = await updateGuidedWorkflow(
    guide.id,
    {
      recordedActions: nextRecordedActions,
      steps: nextSteps,
      status: guide.status === "published" ? "draft" : guide.status
    },
    session
  );

  if (guide.topicId) {
    await getPool().query(
      `
        UPDATE guided_workflow_topics
        SET actions_count = (
              SELECT COUNT(*)::int
              FROM guided_workflow_recorded_actions
              WHERE guided_workflow_recorded_actions.topic_id = guided_workflow_topics.id
            ),
            updated_by = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [guide.topicId, session.user.id]
    );
  }

  return updatedGuide;
}

export async function regenerateGuidedWorkflow(id: string, session: AdminSession) {
  const current = await getGuidedWorkflowById(id, session);
  const generated = generateGuideFromRecording(current.recordedActions, {
    title: current.title,
    description: current.description
  });

  return updateGuidedWorkflow(id, { steps: generated.steps, status: "draft" }, session);
}

export async function createGuideFromRecordingSession(topicId: string, session: AdminSession) {
  const topic = await getGuidedWorkflowTopicById(topicId, session);
  const recordingSession = await getGuidedWorkflowRecordingSessionById(topic.recordingSessionId, session);
  const actions = await listRecordedActionsForTopic(topicId, session);

  if (actions.length === 0) {
    throw new GuidedWorkflowError("Recording session has no actions yet.");
  }

  if (topic.guideId) {
    const currentGuide = await getGuidedWorkflowById(topic.guideId, session);
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
        UPDATE guided_workflow_topics
        SET updated_by = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [topic.id, session.user.id]
    );

    return guide;
  }

  const guide = await createGuidedWorkflow(
    {
      companyId: recordingSession.companyId,
      targetAppId: recordingSession.targetAppId,
      topicId: topic.id,
      title: topic.title,
      recordedActions: actions
    },
    session
  );

  await getPool().query(
    `
      UPDATE guided_workflow_topics
      SET guide_id = $2,
          updated_by = $3,
          updated_at = now()
      WHERE id = $1
    `,
    [topic.id, guide.id, session.user.id]
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

  return result.rows.map((row) =>
    guideWithRuntimeStructure({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      steps: row.steps_json ?? []
    })
  );
}

export async function getPublishedTrainingSessionsForPlayer(input: { targetAppId: string; origin?: string }): Promise<PlayerTrainingSession[]> {
  await getPublishedGuidesForPlayer(input);

  const result = await getPool().query<{
    session_id: string;
    session_title: string;
    topic_id: string;
    topic_title: string;
    guide_id: string;
    guide_description: string;
    guide_status: GuideStatus;
    actions_count: number;
    steps_json: GuideStep[];
    guide_updated_at: Date;
    topic_sort_order: number;
  }>(
    `
      SELECT
        guided_workflow_recording_sessions.id AS session_id,
        guided_workflow_recording_sessions.title AS session_title,
        guided_workflow_topics.id AS topic_id,
        guided_workflow_topics.title AS topic_title,
        guided_workflow_guides.id AS guide_id,
        guided_workflow_guides.description AS guide_description,
        guided_workflow_guides.status AS guide_status,
        guided_workflow_topics.actions_count,
        guided_workflow_guides.steps_json,
        guided_workflow_guides.updated_at AS guide_updated_at,
        guided_workflow_topics.sort_order AS topic_sort_order
      FROM guided_workflow_recording_sessions
      INNER JOIN guided_workflow_topics
        ON guided_workflow_topics.recording_session_id = guided_workflow_recording_sessions.id
      INNER JOIN guided_workflow_guides
        ON guided_workflow_guides.id = guided_workflow_topics.guide_id
      WHERE guided_workflow_recording_sessions.target_app_id = $1
        AND guided_workflow_guides.target_app_id = $1
        AND guided_workflow_guides.status = 'published'
      ORDER BY guided_workflow_recording_sessions.updated_at DESC, guided_workflow_topics.sort_order ASC, guided_workflow_topics.created_at ASC
    `,
    [input.targetAppId]
  );

  const sessions = new Map<string, PlayerTrainingSession>();

  result.rows.forEach((row) => {
    const session = sessions.get(row.session_id) ?? {
      id: row.session_id,
      title: row.session_title,
      topics: []
    };

    session.topics.push({
      id: row.topic_id,
      title: row.topic_title,
      guideId: row.guide_id,
      description: row.guide_description,
      status: row.guide_status,
      actionsCount: Number(row.actions_count),
      steps: row.steps_json?.length ?? 0,
      updatedAt: row.guide_updated_at.toISOString()
    });
    sessions.set(row.session_id, session);
  });

  return Array.from(sessions.values());
}
