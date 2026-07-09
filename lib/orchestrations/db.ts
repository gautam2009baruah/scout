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
import type { EmailTriggerConfig } from "@/shared/orchestrationTypes";

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
  created_by_email: string | null;
  updated_by_email: string | null;
  published_at: Date | null;
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
    createdByEmail: row.created_by_email,
    updatedByEmail: row.updated_by_email,
    publishedAt: row.published_at?.toISOString() || null,
    publishedByEmail: row.published_by_email,
  };
}

export async function createOrchestration(data: {
  companyId: string;
  targetAppId?: string | null;
  name: string;
  description?: string | null;
  variables?: Record<string, unknown>;
  createdByEmail: string;
}): Promise<Orchestration> {
  const pool = getPool();
  const result = await pool.query<OrchestrationRow>(
    `INSERT INTO orchestrations 
     (company_id, target_app_id, name, description, variables, created_by_email, updated_by_email)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING *`,
    [
      data.companyId,
      data.targetAppId || null,
      data.name,
      data.description || null,
      JSON.stringify(data.variables || {}),
      data.createdByEmail,
    ]
  );

  return mapOrchestrationRow(result.rows[0]);
}

export async function getOrchestrations(filters: {
  companyId?: string;
  status?: OrchestrationStatus;
  id?: string;
}): Promise<Orchestration[]> {
  const pool = getPool();
  let query = "SELECT * FROM orchestrations WHERE 1=1";
  const params: any[] = [];

  if (filters.id) {
    params.push(filters.id);
    query += ` AND id = $${params.length}`;
  }

  if (filters.companyId) {
    params.push(filters.companyId);
    query += ` AND company_id = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }

  query += " ORDER BY updated_at DESC";

  const result = await pool.query<OrchestrationRow>(query, params);
  return result.rows.map(mapOrchestrationRow);
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
    updatedByEmail: string;
  }
): Promise<Orchestration> {
  const pool = getPool();

  const updates: string[] = ["updated_at = now()", "updated_by_email = $1"];
  const params: any[] = [data.updatedByEmail];

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

  params.push(id);
  const result = await pool.query<OrchestrationRow>(
    `UPDATE orchestrations SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Orchestration ${id} not found`);
  }

  return mapOrchestrationRow(result.rows[0]);
}

export async function publishOrchestration(
  id: string,
  publishedByEmail: string
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
    createdByEmail: publishedByEmail,
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
        minConfidence: triggerNodeConfig.minConfidence || 0.7,
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
          createdByEmail: publishedByEmail,
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
          createdByEmail: publishedByEmail,
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
               updated_by_email = $5,
               updated_at = NOW()
           WHERE id = $6`,
          [
            `${orchestration.name} - Email Trigger`,
            `Auto-created email trigger for ${orchestration.name}`,
            JSON.stringify(emailTriggerConfig),
            emailTriggerConfig.enabled ? "active" : "inactive",
            publishedByEmail,
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

  // Update status to published
  const result = await pool.query<OrchestrationRow>(
    `UPDATE orchestrations 
     SET status = 'published', published_at = now(), published_by_email = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [publishedByEmail, id]
  );

  return mapOrchestrationRow(result.rows[0]);
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
      data.positionX,
      data.positionY,
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
    params.push(data.positionX);
    updates.push(`position_x = $${params.length}`);
  }

  if (data.positionY !== undefined) {
    params.push(data.positionY);
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
    respondedByEmail: string;
    notes?: string;
  }
): Promise<OrchestrationApproval> {
  const pool = getPool();
  const result = await pool.query<ApprovalRow>(
    `UPDATE orchestration_approvals 
     SET status = $1, response_data = $2, responded_at = now(), responded_by_email = $3, notes = $4
     WHERE id = $5
     RETURNING *`,
    [
      data.status,
      data.responseData ? JSON.stringify(data.responseData) : null,
      data.respondedByEmail,
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
  let query = "SELECT * FROM orchestration_approvals WHERE 1=1";
  const params: any[] = [];

  if (filters.executionId) {
    params.push(filters.executionId);
    query += ` AND execution_id = $${params.length}`;
  }

  if (filters.approverEmail) {
    params.push(filters.approverEmail);
    query += ` AND approver_email = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }

  query += " ORDER BY requested_at DESC";

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
    createdByEmail: row.created_by_email,
    changeNotes: row.change_notes,
  };
}

export async function createOrchestrationVersion(data: {
  orchestrationId: string;
  version: number;
  snapshot: OrchestrationSnapshot;
  createdByEmail: string;
  changeNotes?: string;
}): Promise<OrchestrationVersion> {
  const pool = getPool();
  const result = await pool.query<VersionRow>(
    `INSERT INTO orchestration_versions 
     (orchestration_id, version, snapshot, created_by_email, change_notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.orchestrationId,
      data.version,
      JSON.stringify(data.snapshot),
      data.createdByEmail,
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
    "SELECT * FROM orchestration_versions WHERE orchestration_id = $1 ORDER BY version DESC",
    [orchestrationId]
  );

  return result.rows.map(mapVersionRow);
}
