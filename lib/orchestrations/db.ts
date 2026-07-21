// Database operations for orchestrations
// Handles all CRUD operations for orchestrations, nodes, connections, executions, approvals, and versions

import { getPool } from "@/lib/db/pool";
import type {
  Orchestration,
  OrchestrationNode,
  OrchestrationConnection,
  OrchestrationExecution,
  OrchestrationNodeExecution,
  OrchestrationApproval,
  OrchestrationVersion,
  OrchestrationSnapshot,
  OrchestrationStatus,
  NodeType,
  OrchestrationExecutionStatus,
  NodeExecutionStatus,
  ApprovalStatus,
} from "@/shared/orchestrationTypes";
import { createTrigger } from "./triggers";
import { clearTriggerCache } from "./chatbot-trigger-matcher";
import type { EmailTriggerConfig, ScheduleTriggerConfig } from "@/shared/orchestrationTypes";
import { calculateNextRunTime } from "./scheduler/cron-utils";
import { getSchedulerService } from "./scheduler-service";
import { buildHttpApiTriggerConfig } from "./http-trigger/config";

// ============================================================================
// Orchestrations
// ============================================================================

type OrchestrationRow = {
  id: string;
  company_id: string;
  target_app_id?: string | null;
  name: string;
  description: string | null;
  version: number;
  status: OrchestrationStatus;

  variables: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  created_by_email: string | null;
  updated_by_email: string | null;
  published_at: Date | null;
  published_by: string | null;
  published_by_email: string | null;
};

function mapOrchestrationRow(row: OrchestrationRow): Orchestration {
  return {
    id: row.id,
    companyId: row.company_id,
    targetAppId: row.target_app_id || null,
    name: row.name,
    description: row.description,
    version: row.version,
    status: row.status,
    variables: row.variables,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdById: row.created_by,
    updatedById: row.updated_by,
    createdByEmail: row.created_by_email,
    updatedByEmail: row.updated_by_email,
    publishedAt: row.published_at?.toISOString() || null,
    publishedById: row.published_by,
    publishedByEmail: row.published_by_email,
  };
}

export async function createOrchestration(data: {
  companyId: string;
  targetAppId?: string | null;
  name: string;
  description?: string | null;
  variables?: Record<string, unknown>;
  createdById: string;
}): Promise<Orchestration> {
  const pool = getPool();
  const result = await pool.query<OrchestrationRow>(
    `INSERT INTO orchestrations 
     (company_id, target_app_id, name, description, variables, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING *`,
    [
      data.companyId,
      data.targetAppId || null,
      data.name,
      data.description || null,
      JSON.stringify(data.variables || {}),
      data.createdById,
    ]
  );

  const orchestration = await getOrchestrationById(result.rows[0].id);
  if (!orchestration) {
    throw new Error("Failed to load created orchestration");
  }
  return orchestration;
}

export async function getOrchestrations(filters: {
  companyId?: string;
  status?: OrchestrationStatus;
  id?: string;
}): Promise<Orchestration[]> {
  const pool = getPool();
  let query = `
    SELECT
      o.*,
      created_user.email AS created_by_email,
      updated_user.email AS updated_by_email,
      published_user.email AS published_by_email
    FROM orchestrations o
    LEFT JOIN users created_user ON created_user.id = o.created_by
    LEFT JOIN users updated_user ON updated_user.id = o.updated_by
    LEFT JOIN users published_user ON published_user.id = o.published_by
    WHERE 1=1`;
  const params: any[] = [];

  if (filters.id) {
    params.push(filters.id);
    query += ` AND o.id = $${params.length}`;
  }

  if (filters.companyId) {
    params.push(filters.companyId);
    query += ` AND o.company_id = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND o.status = $${params.length}`;
  }

  query += " ORDER BY o.updated_at DESC";

  const result = await pool.query<OrchestrationRow>(query, params);
  return result.rows.map(mapOrchestrationRow);
}

export async function getOrchestrationPage(filters: {
  companyId?: string;
  targetAppId?: string;
  status?: OrchestrationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
  userId?: string;
}) {
  const pool = getPool();
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const conditions = ["1=1"];
  const params: any[] = [];

  if (filters.companyId) {
    params.push(filters.companyId);
    conditions.push(`o.company_id = $${params.length}`);
  }
  if (filters.targetAppId) {
    params.push(filters.targetAppId);
    conditions.push(`o.target_app_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`o.status = $${params.length}`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    conditions.push(`o.name ILIKE $${params.length}`);
  }
  if (filters.userId) {
    params.push(filters.userId);
    const userParam = params.length;
    conditions.push(`(
      o.target_app_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM user_target_app_access uta
        INNER JOIN company_target_applications scope_cta ON scope_cta.id = uta.target_app_id
        WHERE uta.user_id = $${userParam} AND uta.deleted_at IS NULL
          AND scope_cta.company_id = o.company_id
      )
      OR EXISTS (
        SELECT 1 FROM user_target_app_access uta
        WHERE uta.user_id = $${userParam} AND uta.deleted_at IS NULL
          AND uta.target_app_id = o.target_app_id
      )
    )`);
  }

  const where = conditions.join(" AND ");
  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM orchestrations o WHERE ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const dataParams = [...params, pageSize, (safePage - 1) * pageSize];
  const result = await pool.query<OrchestrationRow>(`
    SELECT o.*, created_user.email AS created_by_email,
      updated_user.email AS updated_by_email,
      published_user.email AS published_by_email
    FROM orchestrations o
    LEFT JOIN users created_user ON created_user.id = o.created_by
    LEFT JOIN users updated_user ON updated_user.id = o.updated_by
    LEFT JOIN users published_user ON published_user.id = o.published_by
    WHERE ${where}
    ORDER BY o.updated_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  );

  return { orchestrations: result.rows.map(mapOrchestrationRow), page: safePage, pageSize, pageCount, total };
}

export async function getOrchestrationById(id: string): Promise<Orchestration | null> {
  const orchestrations = await getOrchestrations({ id });
  return orchestrations[0] || null;
}

export async function updateOrchestration(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    variables?: Record<string, unknown>;
    targetAppId?: string | null;
    updatedById: string;
  }
): Promise<Orchestration> {
  const pool = getPool();

  const updates: string[] = ["updated_at = now()", "updated_by = $1"];
  const params: any[] = [data.updatedById];

  if (data.name !== undefined) {
    params.push(data.name);
    updates.push(`name = $${params.length}`);
  }

  if (data.description !== undefined) {
    params.push(data.description);
    updates.push(`description = $${params.length}`);
  }

  if (data.variables !== undefined) {
    params.push(JSON.stringify(data.variables));
    updates.push(`variables = $${params.length}`);
  }

  if (data.targetAppId !== undefined) {
    params.push(data.targetAppId || null);
    updates.push(`target_app_id = $${params.length}`);
  }

  params.push(id);
  const result = await pool.query<OrchestrationRow>(
    `UPDATE orchestrations SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Orchestration ${id} not found`);
  }

  const orchestration = await getOrchestrationById(result.rows[0].id);
  if (!orchestration) {
    throw new Error(`Orchestration ${id} not found`);
  }
  return orchestration;
}

export async function publishOrchestration(
  id: string,
  publishedById: string
): Promise<Orchestration> {
  const pool = getPool();

  // Create version snapshot before publishing
  const orchestration = await getOrchestrationById(id);
  if (!orchestration) {
    throw new Error(`Orchestration ${id} not found`);
  }

  const nodes = await getNodes(id);
  const connections = await getConnections(id);

  // Validate orchestration before publishing
  const triggerNodes = nodes.filter(n => n.nodeType === "trigger");
  if (triggerNodes.length === 0) {
    throw new Error("Cannot publish: Orchestration must have at least one trigger node");
  }

  const endNodes = nodes.filter(n => n.nodeType === "end");
  if (endNodes.length === 0) {
    throw new Error("Cannot publish: Orchestration must have at least one end node");
  }

  if (nodes.length < 2) {
    throw new Error("Cannot publish: Orchestration must have at least a trigger and an end node");
  }

  // Check if trigger is configured
  const triggerNode = triggerNodes[0];
  if (!triggerNode.config || Object.keys(triggerNode.config).length === 0) {
    throw new Error("Cannot publish: Trigger node must be configured");
  }

  // Increment version number before creating snapshot
  const newVersion = orchestration.version + 1;
  await pool.query(
    `UPDATE orchestrations SET version = $1, updated_at = now() WHERE id = $2`,
    [newVersion, id]
  );

  // Create version snapshot with new version number
  await createOrchestrationVersion({
    orchestrationId: id,
    version: newVersion,
    snapshot: { orchestration, nodes, connections },
    createdById: publishedById,
    changeNotes: "Published",
  });

  // Auto-create orchestration_triggers record for trigger node types that run outside manual execution.
  const triggerNodeConfig = triggerNode.config as any;
  if (triggerNodeConfig.triggerType === 'chatbot') {
    console.log('📝 Auto-creating/updating chatbot trigger record...');
    
    try {
      // Check if trigger already exists
      const existingTriggers = await pool.query(
        `SELECT id FROM orchestration_triggers 
         WHERE orchestration_id = $1 AND trigger_type = 'chatbot'`,
        [id]
      );
      
      const chatbotTriggerConfig = {
        type: 'chatbot' as const,
        triggerPhrases: triggerNodeConfig.triggerPhrases || triggerNodeConfig.examplePhrases || [],
        examplePhrases: triggerNodeConfig.examplePhrases || [],
        requiredVariables: triggerNodeConfig.requiredVariables || [],
        allowedRoles: triggerNodeConfig.allowedRoles || [],
        allowedUsers: triggerNodeConfig.allowedUsers || [],
        minConfidence: triggerNodeConfig.minConfidence ?? 0.6,
        enabled: triggerNodeConfig.enabled !== false,
      };
      
      if (existingTriggers.rows.length === 0) {
        // Create new chatbot trigger
        await createTrigger({
          orchestrationId: id,
          triggerType: 'chatbot',
          name: `${orchestration.name} - Chatbot Trigger`,
          description: `Auto-created chatbot trigger for ${orchestration.name}`,
          config: chatbotTriggerConfig,
          createdById: publishedById,
        });
        
        console.log('✅ Chatbot trigger created successfully');
      } else {
        // Update existing trigger
        const triggerId = existingTriggers.rows[0].id;
        await pool.query(
          `UPDATE orchestration_triggers 
           SET name = $1, 
               description = $2, 
               config = $3,
               updated_at = NOW()
           WHERE id = $4`,
          [
            `${orchestration.name} - Chatbot Trigger`,
            `Auto-created chatbot trigger for ${orchestration.name}`,
            JSON.stringify(chatbotTriggerConfig),
            triggerId
          ]
        );
        console.log('✅ Chatbot trigger updated successfully');
      }
      
      // Clear cache so updated trigger is immediately available
      clearTriggerCache();
    } catch (error) {
      console.error('⚠️ Failed to auto-create/update chatbot trigger:', error);
      // Don't fail the publish if trigger creation fails
    }
  }

  if (triggerNodeConfig.triggerType === 'email') {
    console.log('Auto-creating/updating email trigger record...');

    try {
      if (!triggerNodeConfig.emailCredentialId) {
        throw new Error("Email credential is required for email trigger");
      }

      const credentialResult = await pool.query<{
        id: string;
        provider: "gmail" | "outlook" | "imap";
        email_address: string;
      }>(
        `SELECT id, provider, email_address
         FROM email_credentials
         WHERE id = $1 AND company_id = $2 AND is_active = true`,
        [triggerNodeConfig.emailCredentialId, orchestration.companyId]
      );

      const credential = credentialResult.rows[0];
      if (!credential) {
        throw new Error("Selected email credential was not found or is inactive");
      }

      const emailTriggerConfig: EmailTriggerConfig = {
        type: "email",
        provider: credential.provider,
        mailbox: credential.email_address,
        folder: triggerNodeConfig.folder || "INBOX",
        senderFilter: triggerNodeConfig.senderFilter || undefined,
        subjectContains: triggerNodeConfig.subjectContains || undefined,
        bodyContains: triggerNodeConfig.bodyContains || undefined,
        unreadOnly: triggerNodeConfig.unreadOnly !== false,
        hasAttachment: triggerNodeConfig.hasAttachment === true,
        pollingIntervalMinutes: Number(triggerNodeConfig.pollingIntervalMinutes) || 5,
        markAsProcessed: triggerNodeConfig.markAsProcessed !== false,
        credentialId: credential.id,
        enabled: triggerNodeConfig.enabled !== false,
      };

      const existingTriggers = await pool.query(
        `SELECT id FROM orchestration_triggers
         WHERE orchestration_id = $1 AND trigger_type = 'email'`,
        [id]
      );

      if (existingTriggers.rows.length === 0) {
        await createTrigger({
          orchestrationId: id,
          triggerType: "email",
          name: `${orchestration.name} - Email Trigger`,
          description: `Auto-created email trigger for ${orchestration.name}`,
          config: emailTriggerConfig,
          createdById: publishedById,
        });

        console.log('Email trigger created successfully');
      } else {
        const triggerId = existingTriggers.rows[0].id;
        await pool.query(
          `UPDATE orchestration_triggers
           SET name = $1,
               description = $2,
               config = $3,
               status = $4,
               updated_by = $5,
               updated_at = NOW()
           WHERE id = $6`,
          [
            `${orchestration.name} - Email Trigger`,
            `Auto-created email trigger for ${orchestration.name}`,
            JSON.stringify(emailTriggerConfig),
            emailTriggerConfig.enabled ? "active" : "inactive",
            publishedById,
            triggerId,
          ]
        );

        console.log('Email trigger updated successfully');
      }
    } catch (error) {
      console.error('Failed to auto-create/update email trigger:', error);
      throw error;
    }
  }

  if (triggerNodeConfig.triggerType === "schedule") {
    console.log("Auto-creating/updating schedule trigger record...");

    try {
      const scheduleTriggerConfig: ScheduleTriggerConfig = {
        type: "schedule",
        scheduleType: triggerNodeConfig.scheduleType || "daily",
        cronExpression: triggerNodeConfig.cronExpression || undefined,
        specificTimeUtc: triggerNodeConfig.specificTimeUtc || triggerNodeConfig.specificTime || undefined,
        dayOfWeek:
          triggerNodeConfig.dayOfWeek === undefined || triggerNodeConfig.dayOfWeek === null
            ? undefined
            : Number(triggerNodeConfig.dayOfWeek),
        dayOfMonth:
          triggerNodeConfig.dayOfMonth === undefined || triggerNodeConfig.dayOfMonth === null
            ? undefined
            : Number(triggerNodeConfig.dayOfMonth),
        oneTimeDate: triggerNodeConfig.oneTimeDate || undefined,
        timezone: triggerNodeConfig.timezone || "UTC",
        startDate: triggerNodeConfig.startDate || undefined,
        endDate: triggerNodeConfig.endDate || undefined,
        enabled: triggerNodeConfig.enabled !== false,
      };

      const nextRunAt = calculateNextRunTime(scheduleTriggerConfig);
      if (nextRunAt) {
        scheduleTriggerConfig.nextRunAt = nextRunAt;
      }

      const existingTriggers = await pool.query(
        `SELECT id, last_triggered_at FROM orchestration_triggers
         WHERE orchestration_id = $1 AND trigger_type = 'schedule'`,
        [id]
      );

      let scheduleTriggerId: string;
      const scheduleStatus = scheduleTriggerConfig.enabled ? "active" : "inactive";

      if (existingTriggers.rows.length === 0) {
        const created = await createTrigger({
          orchestrationId: id,
          triggerType: "schedule",
          name: `${orchestration.name} - Schedule Trigger`,
          description: `Auto-created schedule trigger for ${orchestration.name}`,
          config: scheduleTriggerConfig,
          createdById: publishedById,
        });

        scheduleTriggerId = created.id;
        await pool.query(
          `UPDATE orchestration_triggers
           SET status = $1, updated_by = $2, updated_at = NOW()
           WHERE id = $3`,
          [scheduleStatus, publishedById, scheduleTriggerId]
        );

        console.log("Schedule trigger created successfully");
      } else {
        scheduleTriggerId = existingTriggers.rows[0].id;

        await pool.query(
          `UPDATE orchestration_triggers
           SET name = $1,
               description = $2,
               config = $3,
               status = $4,
               updated_by = $5,
               updated_at = NOW()
           WHERE id = $6`,
          [
            `${orchestration.name} - Schedule Trigger`,
            `Auto-created schedule trigger for ${orchestration.name}`,
            JSON.stringify(scheduleTriggerConfig),
            scheduleStatus,
            publishedById,
            scheduleTriggerId,
          ]
        );

        console.log("Schedule trigger updated successfully");
      }

      const scheduler = getSchedulerService();
      if (scheduleTriggerConfig.enabled) {
        await scheduler.registerTrigger({
          id: scheduleTriggerId,
          orchestrationId: id,
          name: `${orchestration.name} - Schedule Trigger`,
          config: scheduleTriggerConfig,
          status: "active",
          lastTriggeredAt: existingTriggers.rows[0]?.last_triggered_at?.toISOString?.() || null,
          nextRunAt: scheduleTriggerConfig.nextRunAt || null,
        });
      } else {
        await scheduler.disableTrigger(scheduleTriggerId);
      }
    } catch (error) {
      console.error("Failed to auto-create/update schedule trigger:", error);
      throw error;
    }
  }

  if (triggerNodeConfig.triggerType === "http_api") {
    console.log("Auto-creating/updating HTTP/API trigger record...");

    try {
      const httpTriggerConfig = await buildHttpApiTriggerConfig(triggerNodeConfig, id);

      const existingTriggers = await pool.query(
        `SELECT id
         FROM orchestration_triggers
         WHERE orchestration_id = $1 AND trigger_type = 'http_api'`,
        [id]
      );

      if (existingTriggers.rows.length === 0) {
        const created = await createTrigger({
          orchestrationId: id,
          triggerType: "http_api",
          name: `${orchestration.name} - HTTP/API Trigger`,
          description: `Auto-created HTTP/API trigger for ${orchestration.name}`,
          config: httpTriggerConfig,
          createdById: publishedById,
        });

        await pool.query(
          `UPDATE orchestration_triggers
           SET endpoint_slug = $1,
               status = $2,
               updated_by = $3,
               updated_at = NOW()
           WHERE id = $4`,
          [
            httpTriggerConfig.shortName,
            httpTriggerConfig.status === "active" ? "active" : httpTriggerConfig.status,
            publishedById,
            created.id,
          ]
        );

        console.log("HTTP/API trigger created successfully");
      } else {
        const triggerId = existingTriggers.rows[0].id;
        await pool.query(
          `UPDATE orchestration_triggers
           SET name = $1,
               description = $2,
               config = $3,
               endpoint_slug = $4,
               status = $5,
               updated_by = $6,
               updated_at = NOW()
           WHERE id = $7`,
          [
            `${orchestration.name} - HTTP/API Trigger`,
            `Auto-created HTTP/API trigger for ${orchestration.name}`,
            JSON.stringify(httpTriggerConfig),
            httpTriggerConfig.shortName,
            httpTriggerConfig.status === "active" ? "active" : httpTriggerConfig.status,
            publishedById,
            triggerId,
          ]
        );

        console.log("HTTP/API trigger updated successfully");
      }
    } catch (error) {
      console.error("Failed to auto-create/update HTTP/API trigger:", error);
      throw error;
    }
  }

  // Update status to published
  const result = await pool.query<OrchestrationRow>(
    `UPDATE orchestrations 
     SET status = 'published', published_at = now(), published_by = $1, updated_by = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [publishedById, id]
  );

  const updated = await getOrchestrationById(result.rows[0].id);
  if (!updated) {
    throw new Error(`Orchestration ${id} not found after publish`);
  }
  return updated;
}

export async function deleteOrchestration(id: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM orchestrations WHERE id = $1", [id]);
}

// ============================================================================
// Nodes
// ============================================================================

type NodeRow = {
  id: string;
  orchestration_id: string;
  node_type: NodeType;
  label: string;
  position_x: number;
  position_y: number;
  config: Record<string, unknown>;
  display_description?: string;
  created_at: Date;
  updated_at: Date;
};

function mapNodeRow(row: NodeRow): OrchestrationNode {
  return {
    id: row.id,
    orchestrationId: row.orchestration_id,
    nodeType: row.node_type,
    label: row.label,
    positionX: row.position_x,
    positionY: row.position_y,
    config: row.config as any,
    displayDescription: row.display_description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createNode(data: {
  orchestrationId: string;
  nodeType: NodeType;
  label: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
  displayDescription?: string;
}): Promise<OrchestrationNode> {
  const pool = getPool();
  const result = await pool.query<NodeRow>(
    `INSERT INTO orchestration_nodes 
     (orchestration_id, node_type, label, position_x, position_y, config, display_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.orchestrationId,
      data.nodeType,
      data.label,
      Math.round(data.positionX),
      Math.round(data.positionY),
      JSON.stringify(data.config),
      data.displayDescription,
    ]
  );

  return mapNodeRow(result.rows[0]);
}

export async function getNodes(orchestrationId: string): Promise<OrchestrationNode[]> {
  const pool = getPool();
  const result = await pool.query<NodeRow>(
    "SELECT * FROM orchestration_nodes WHERE orchestration_id = $1 ORDER BY created_at",
    [orchestrationId]
  );

  return result.rows.map(mapNodeRow);
}

export async function getNodeById(id: string): Promise<OrchestrationNode | null> {
  const pool = getPool();
  const result = await pool.query<NodeRow>(
    "SELECT * FROM orchestration_nodes WHERE id = $1",
    [id]
  );

  return result.rows[0] ? mapNodeRow(result.rows[0]) : null;
}

export async function updateNode(
  id: string,
  data: {
    label?: string;
    positionX?: number;
    positionY?: number;
    config?: Record<string, unknown>;
    displayDescription?: string;
  }
): Promise<OrchestrationNode> {
  const pool = getPool();

  const updates: string[] = ["updated_at = now()"];
  const params: any[] = [];

  if (data.label !== undefined) {
    params.push(data.label);
    updates.push(`label = $${params.length}`);
  }

  if (data.positionX !== undefined) {
    params.push(Math.round(data.positionX));
    updates.push(`position_x = $${params.length}`);
  }

  if (data.positionY !== undefined) {
    params.push(Math.round(data.positionY));
    updates.push(`position_y = $${params.length}`);
  }

  if (data.config !== undefined) {
    params.push(JSON.stringify(data.config));
    updates.push(`config = $${params.length}`);
  }

  if (data.displayDescription !== undefined) {
    params.push(data.displayDescription);
    updates.push(`display_description = $${params.length}`);
  }

  params.push(id);
  const result = await pool.query<NodeRow>(
    `UPDATE orchestration_nodes SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Node ${id} not found`);
  }

  const node = result.rows[0];

  // Also update parent orchestration's updated_at to mark it as having unsaved changes
  await pool.query(
    `UPDATE orchestrations SET updated_at = now() WHERE id = $1`,
    [node.orchestration_id]
  );

  return mapNodeRow(node);
}

export async function deleteNode(id: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM orchestration_nodes WHERE id = $1", [id]);
}

// ============================================================================
// Connections
// ============================================================================

type ConnectionRow = {
  id: string;
  orchestration_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  condition: Record<string, unknown> | null;
  created_at: Date;
};

function mapConnectionRow(row: ConnectionRow): OrchestrationConnection {
  return {
    id: row.id,
    orchestrationId: row.orchestration_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    sourceHandle: row.source_handle,
    targetHandle: row.target_handle,
    condition: row.condition,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createConnection(data: {
  orchestrationId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  condition?: Record<string, unknown> | null;
}): Promise<OrchestrationConnection> {
  const pool = getPool();
  const result = await pool.query<ConnectionRow>(
    `INSERT INTO orchestration_connections 
     (orchestration_id, source_node_id, target_node_id, source_handle, target_handle, condition)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.orchestrationId,
      data.sourceNodeId,
      data.targetNodeId,
      data.sourceHandle || null,
      data.targetHandle || null,
      data.condition ? JSON.stringify(data.condition) : null,
    ]
  );

  return mapConnectionRow(result.rows[0]);
}

export async function getConnections(orchestrationId: string): Promise<OrchestrationConnection[]> {
  const pool = getPool();
  const result = await pool.query<ConnectionRow>(
    "SELECT * FROM orchestration_connections WHERE orchestration_id = $1 ORDER BY created_at",
    [orchestrationId]
  );

  return result.rows.map(mapConnectionRow);
}

export async function deleteConnection(id: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM orchestration_connections WHERE id = $1", [id]);
}

// ============================================================================
// Executions
// ============================================================================

type ExecutionRow = {
  id: string;
  orchestration_id: string;
  orchestration_version: number;
  status: OrchestrationExecutionStatus;
  context: Record<string, unknown>;
  trigger_data: Record<string, unknown> | null;
  started_at: Date;
  completed_at: Date | null;
  error_message: string | null;
  current_node_id: string | null;
  triggered_by: string | null;
};

function mapExecutionRow(row: ExecutionRow): OrchestrationExecution {
  return {
    id: row.id,
    orchestrationId: row.orchestration_id,
    orchestrationVersion: row.orchestration_version,
    status: row.status,
    context: row.context,
    triggerData: row.trigger_data,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at?.toISOString() || null,
    errorMessage: row.error_message,
    currentNodeId: row.current_node_id,
    triggeredBy: row.triggered_by,
  };
}

export async function createExecution(data: {
  orchestrationId: string;
  orchestrationVersion: number;
  context?: Record<string, unknown>;
  triggerData?: Record<string, unknown> | null;
  triggeredBy: string;
}): Promise<OrchestrationExecution> {
  const pool = getPool();
  const result = await pool.query<ExecutionRow>(
    `INSERT INTO orchestration_executions 
     (orchestration_id, orchestration_version, context, trigger_data, triggered_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.orchestrationId,
      data.orchestrationVersion,
      JSON.stringify(data.context || {}),
      data.triggerData ? JSON.stringify(data.triggerData) : null,
      data.triggeredBy,
    ]
  );

  return mapExecutionRow(result.rows[0]);
}

export async function getExecutions(filters: {
  orchestrationId?: string;
  id?: string;
  status?: OrchestrationExecutionStatus;
}): Promise<OrchestrationExecution[]> {
  const pool = getPool();
  let query = "SELECT * FROM orchestration_executions WHERE 1=1";
  const params: any[] = [];

  if (filters.id) {
    params.push(filters.id);
    query += ` AND id = $${params.length}`;
  }

  if (filters.orchestrationId) {
    params.push(filters.orchestrationId);
    query += ` AND orchestration_id = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }

  query += " ORDER BY started_at DESC";

  const result = await pool.query<ExecutionRow>(query, params);
  return result.rows.map(mapExecutionRow);
}

export async function getExecutionById(id: string): Promise<OrchestrationExecution | null> {
  const executions = await getExecutions({ id });
  return executions[0] || null;
}

export async function updateExecution(
  id: string,
  data: {
    status?: OrchestrationExecutionStatus;
    context?: Record<string, unknown>;
    currentNodeId?: string | null;
    errorMessage?: string | null;
  }
): Promise<OrchestrationExecution> {
  const pool = getPool();

  const updates: string[] = [];
  const params: any[] = [];

  if (data.status !== undefined) {
    params.push(data.status);
    updates.push(`status = $${params.length}`);

    // Set completed_at when status changes to completed, failed, or cancelled
    if (["completed", "failed", "cancelled"].includes(data.status)) {
      updates.push("completed_at = now()");
    }
  }

  if (data.context !== undefined) {
    params.push(JSON.stringify(data.context));
    updates.push(`context = $${params.length}`);
  }

  if (data.currentNodeId !== undefined) {
    params.push(data.currentNodeId);
    updates.push(`current_node_id = $${params.length}`);
  }

  if (data.errorMessage !== undefined) {
    params.push(data.errorMessage);
    updates.push(`error_message = $${params.length}`);
  }

  if (updates.length === 0) {
    throw new Error("No updates provided");
  }

  params.push(id);
  const result = await pool.query<ExecutionRow>(
    `UPDATE orchestration_executions SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Execution ${id} not found`);
  }

  return mapExecutionRow(result.rows[0]);
}

// ============================================================================
// Clarifications
// ============================================================================

export type OrchestrationClarificationRequest = {
  id: string;
  executionId: string;
  nodeExecutionId: string;
  nodeId: string;
  conversationId: string | null;
  companyId: string;
  targetAppId: string | null;
  outputVariable: string;
  partialOutput: Record<string, unknown>;
  missingFields: Array<{
    key: string;
    type: string;
    description?: string;
  }>;
  prompt: string;
  expiresAt: string;
  status: "active" | "resolved" | "expired";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  responseText: string | null;
  responseData: Record<string, unknown> | null;
};

type ClarificationRow = {
  id: string;
  execution_id: string;
  node_execution_id: string;
  node_id: string;
  conversation_id: string | null;
  company_id: string;
  target_app_id: string | null;
  output_variable: string;
  partial_output_json: Record<string, unknown>;
  missing_fields_json: Array<{ key: string; type: string; description?: string }>;
  prompt: string;
  expires_at: Date;
  status: "active" | "resolved" | "expired";
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  response_text: string | null;
  response_json: Record<string, unknown> | null;
};

function mapClarificationRow(row: ClarificationRow): OrchestrationClarificationRequest {
  return {
    id: row.id,
    executionId: row.execution_id,
    nodeExecutionId: row.node_execution_id,
    nodeId: row.node_id,
    conversationId: row.conversation_id,
    companyId: row.company_id,
    targetAppId: row.target_app_id,
    outputVariable: row.output_variable,
    partialOutput: row.partial_output_json ?? {},
    missingFields: row.missing_fields_json ?? [],
    prompt: row.prompt,
    expiresAt: row.expires_at.toISOString(),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() || null,
    responseText: row.response_text,
    responseData: row.response_json ?? null,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

async function resolvePersistedConversationId(
  pool: ReturnType<typeof getPool>,
  companyId: string,
  conversationId?: string | null
): Promise<string | null> {
  const candidate = String(conversationId || "").trim();
  if (!candidate || !isUuid(candidate)) {
    return null;
  }

  const result = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM conversations
      WHERE id = $1
        AND company_id = $2
      LIMIT 1
    `,
    [candidate, companyId]
  );

  return result.rows[0]?.id || null;
}

export async function createClarificationRequest(data: {
  executionId: string;
  nodeExecutionId: string;
  nodeId: string;
  conversationId?: string | null;
  companyId: string;
  targetAppId?: string | null;
  outputVariable: string;
  partialOutput: Record<string, unknown>;
  missingFields: Array<{
    key: string;
    type: string;
    description?: string;
  }>;
  prompt: string;
  expiresAt: string;
}): Promise<OrchestrationClarificationRequest> {
  const pool = getPool();
  const persistedConversationId = await resolvePersistedConversationId(pool, data.companyId, data.conversationId);
  const result = await pool.query<ClarificationRow>(
    `INSERT INTO orchestration_clarifications
     (execution_id, node_execution_id, node_id, conversation_id, company_id, target_app_id, output_variable, partial_output_json, missing_fields_json, prompt, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      data.executionId,
      data.nodeExecutionId,
      data.nodeId,
      persistedConversationId,
      data.companyId,
      data.targetAppId || null,
      data.outputVariable,
      JSON.stringify(data.partialOutput || {}),
      JSON.stringify(data.missingFields || []),
      data.prompt,
      data.expiresAt,
    ]
  );

  return mapClarificationRow(result.rows[0]);
}

export async function getActiveClarificationRequestForConversation(input: {
  companyId: string;
  conversationId: string;
}): Promise<OrchestrationClarificationRequest | null> {
  const pool = getPool();
  const result = await pool.query<ClarificationRow>(
    `SELECT *
     FROM orchestration_clarifications
     WHERE company_id = $1
       AND conversation_id = $2
       AND status = 'active'
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.companyId, input.conversationId]
  );

  return result.rows[0] ? mapClarificationRow(result.rows[0]) : null;
}

export async function resolveClarificationRequest(id: string, data: {
  responseText: string;
  responseData: Record<string, unknown>;
}): Promise<OrchestrationClarificationRequest> {
  const pool = getPool();
  const result = await pool.query<ClarificationRow>(
    `UPDATE orchestration_clarifications
     SET status = 'resolved',
         resolved_at = now(),
         response_text = $2,
         response_json = $3,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, data.responseText, JSON.stringify(data.responseData || {})]
  );

  if (result.rows.length === 0) {
    throw new Error(`Clarification ${id} not found`);
  }

  return mapClarificationRow(result.rows[0]);
}

// ============================================================================
// Node Executions
// ============================================================================

type NodeExecutionRow = {
  id: string;
  execution_id: string;
  node_id: string;
  node_type: NodeType;
  node_label: string;
  status: NodeExecutionStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  retry_count: number;
};

function mapNodeExecutionRow(row: NodeExecutionRow): OrchestrationNodeExecution {
  return {
    id: row.id,
    executionId: row.execution_id,
    nodeId: row.node_id,
    nodeType: row.node_type,
    nodeLabel: row.node_label,
    status: row.status,
    input: row.input,
    output: row.output,
    errorMessage: row.error_message,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at?.toISOString() || null,
    durationMs: row.duration_ms,
    retryCount: row.retry_count,
  };
}

export async function createNodeExecution(data: {
  executionId: string;
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  status: NodeExecutionStatus;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<OrchestrationNodeExecution> {
  const pool = getPool();
  const result = await pool.query<NodeExecutionRow>(
    `INSERT INTO orchestration_node_executions 
     (execution_id, node_id, node_type, node_label, status, input, output, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.executionId,
      data.nodeId,
      data.nodeType,
      data.nodeLabel,
      data.status,
      data.input ? JSON.stringify(data.input) : null,
      data.output ? JSON.stringify(data.output) : null,
      data.errorMessage || null,
    ]
  );

  return mapNodeExecutionRow(result.rows[0]);
}

export async function updateNodeExecution(
  id: string,
  data: {
    status?: NodeExecutionStatus;
    output?: Record<string, unknown> | null;
    errorMessage?: string | null;
  }
): Promise<OrchestrationNodeExecution> {
  const pool = getPool();

  const updates: string[] = [];
  const params: any[] = [];

  if (data.status !== undefined) {
    params.push(data.status);
    updates.push(`status = $${params.length}`);

    // Set completed_at and calculate duration when status changes to completed or failed
    if (["completed", "failed", "skipped"].includes(data.status)) {
      updates.push("completed_at = now()");
      updates.push("duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000");
    }
  }

  if (data.output !== undefined) {
    params.push(data.output ? JSON.stringify(data.output) : null);
    updates.push(`output = $${params.length}`);
  }

  if (data.errorMessage !== undefined) {
    params.push(data.errorMessage);
    updates.push(`error_message = $${params.length}`);
  }

  if (updates.length === 0) {
    throw new Error("No updates provided");
  }

  params.push(id);
  const result = await pool.query<NodeExecutionRow>(
    `UPDATE orchestration_node_executions SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Node execution ${id} not found`);
  }

  return mapNodeExecutionRow(result.rows[0]);
}

export async function getNodeExecutions(executionId: string): Promise<OrchestrationNodeExecution[]> {
  const pool = getPool();
  const result = await pool.query<NodeExecutionRow>(
    "SELECT * FROM orchestration_node_executions WHERE execution_id = $1 ORDER BY started_at",
    [executionId]
  );

  return result.rows.map(mapNodeExecutionRow);
}

// ============================================================================
// Approvals
// ============================================================================

type ApprovalRow = {
  id: string;
  execution_id: string;
  node_execution_id: string;
  approver_email: string;
  status: ApprovalStatus;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  requested_at: Date;
  responded_at: Date | null;
  responded_by: string | null;
  responded_by_email: string | null;
  notes: string | null;
};

function mapApprovalRow(row: ApprovalRow): OrchestrationApproval {
  return {
    id: row.id,
    executionId: row.execution_id,
    nodeExecutionId: row.node_execution_id,
    approverEmail: row.approver_email,
    status: row.status,
    requestData: row.request_data,
    responseData: row.response_data,
    requestedAt: row.requested_at.toISOString(),
    respondedAt: row.responded_at?.toISOString() || null,
    respondedById: row.responded_by,
    respondedByEmail: row.responded_by_email,
    notes: row.notes,
  };
}

export async function createApproval(data: {
  executionId: string;
  nodeExecutionId: string;
  approverEmail: string;
  requestData?: Record<string, unknown>;
}): Promise<OrchestrationApproval> {
  const pool = getPool();
  const result = await pool.query<ApprovalRow>(
    `INSERT INTO orchestration_approvals 
     (execution_id, node_execution_id, approver_email, request_data)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      data.executionId,
      data.nodeExecutionId,
      data.approverEmail,
      data.requestData ? JSON.stringify(data.requestData) : null,
    ]
  );

  return mapApprovalRow(result.rows[0]);
}

export async function updateApproval(
  id: string,
  data: {
    status: ApprovalStatus;
    responseData?: Record<string, unknown>;
    respondedById: string;
    notes?: string;
  }
): Promise<OrchestrationApproval> {
  const pool = getPool();
  const result = await pool.query<ApprovalRow>(
    `UPDATE orchestration_approvals 
     SET status = $1, response_data = $2, responded_at = now(), responded_by = $3, notes = $4
     WHERE id = $5
     RETURNING *,
       (SELECT users.email FROM users WHERE users.id = orchestration_approvals.responded_by) AS responded_by_email`,
    [
      data.status,
      data.responseData ? JSON.stringify(data.responseData) : null,
      data.respondedById,
      data.notes || null,
      id,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error(`Approval ${id} not found`);
  }

  return mapApprovalRow(result.rows[0]);
}

export async function getApprovals(filters: {
  executionId?: string;
  approverEmail?: string;
  status?: ApprovalStatus;
}): Promise<OrchestrationApproval[]> {
  const pool = getPool();
  let query = `
    SELECT oa.*, responded_user.email AS responded_by_email
    FROM orchestration_approvals oa
    LEFT JOIN users responded_user ON responded_user.id = oa.responded_by
    WHERE 1=1`;
  const params: any[] = [];

  if (filters.executionId) {
    params.push(filters.executionId);
    query += ` AND oa.execution_id = $${params.length}`;
  }

  if (filters.approverEmail) {
    params.push(filters.approverEmail);
    query += ` AND oa.approver_email = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND oa.status = $${params.length}`;
  }

  query += " ORDER BY oa.requested_at DESC";

  const result = await pool.query<ApprovalRow>(query, params);
  return result.rows.map(mapApprovalRow);
}

// ============================================================================
// Versions
// ============================================================================

type VersionRow = {
  id: string;
  orchestration_id: string;
  version: number;
  snapshot: OrchestrationSnapshot;
  created_at: Date;
  created_by: string | null;
  created_by_email: string | null;
  change_notes: string | null;
};

function mapVersionRow(row: VersionRow): OrchestrationVersion {
  return {
    id: row.id,
    orchestrationId: row.orchestration_id,
    version: row.version,
    snapshot: row.snapshot,
    createdAt: row.created_at.toISOString(),
    createdById: row.created_by,
    createdByEmail: row.created_by_email,
    changeNotes: row.change_notes,
  };
}

export async function createOrchestrationVersion(data: {
  orchestrationId: string;
  version: number;
  snapshot: OrchestrationSnapshot;
  createdById: string;
  changeNotes?: string;
}): Promise<OrchestrationVersion> {
  const pool = getPool();
  const result = await pool.query<VersionRow>(
    `INSERT INTO orchestration_versions 
     (orchestration_id, version, snapshot, created_by, change_notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.orchestrationId,
      data.version,
      JSON.stringify(data.snapshot),
      data.createdById,
      data.changeNotes || null,
    ]
  );

  return mapVersionRow(result.rows[0]);
}

export async function getOrchestrationVersions(
  orchestrationId: string
): Promise<OrchestrationVersion[]> {
  const pool = getPool();
  const result = await pool.query<VersionRow>(
    `SELECT v.*, created_user.email AS created_by_email
     FROM orchestration_versions v
     LEFT JOIN users created_user ON created_user.id = v.created_by
     WHERE v.orchestration_id = $1
     ORDER BY v.version DESC`,
    [orchestrationId]
  );

  return result.rows.map(mapVersionRow);
}
