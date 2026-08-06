// API endpoint for orchestration triggers
// Handles trigger CRUD and execution

import { NextRequest, NextResponse } from "next/server";
import {
  createTrigger,
  getTriggers,
  getTriggerById,
  updateTrigger,
  deleteTrigger,
  validateTriggerConfig,
  assertTriggerOwnership,
} from "@/lib/orchestrations/triggers";
import { assertOrchestrationOwnership, OrchestrationAccessError } from "@/lib/orchestrations/db";
import { getPool } from "@/lib/db/pool";
import type { TriggerConfig, OrchestrationTriggerType, TriggerStatus } from "@/shared/orchestrationTypes";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { clearTriggerCache } from "@/lib/orchestrations/chatbot-trigger-matcher";
import { InputValidationError } from "@/lib/validation/input-limits";
import { mapDatabaseInputError } from "@/lib/db/errors";

// A trigger's email-related credential reference(s) must belong to the same
// company as the orchestration itself — otherwise a trigger could be wired
// up to poll/send using another company's mailbox credential.
async function assertEmailCredentialsBelongToCompany(config: any, companyId: string, targetAppId: string | null) {
  const credentialIds = new Set<string>();
  if (typeof config?.emailCredentialId === "string" && config.emailCredentialId) {
    credentialIds.add(config.emailCredentialId);
  }
  if (config?.emailCredentialIdsByEnvironment && typeof config.emailCredentialIdsByEnvironment === "object") {
    for (const ids of Object.values(config.emailCredentialIdsByEnvironment)) {
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === "string" && id) credentialIds.add(id);
        }
      }
    }
  }

  if (credentialIds.size === 0) return;

  const result = await getPool().query<{ id: string; target_app_id: string | null; environment_ids: string[] }>(
    `SELECT ec.id, ec.target_app_id,
       COALESCE(array_agg(ece.environment_id) FILTER (WHERE ece.environment_id IS NOT NULL), ARRAY[]::uuid[]) AS environment_ids
     FROM email_credentials ec
     LEFT JOIN email_credential_environments ece ON ece.email_credential_id = ec.id
     WHERE ec.id = ANY($1::uuid[]) AND ec.company_id = $2
     GROUP BY ec.id, ec.target_app_id`,
    [Array.from(credentialIds), companyId]
  );
  const validIds = new Set(result.rows.map((row) => row.id));
  const invalid = Array.from(credentialIds).filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new Error("One or more selected email credentials do not belong to this company");
  }

  const byId = new Map(result.rows.map((row) => [row.id, row]));
  for (const [environmentId, ids] of Object.entries(config?.emailCredentialIdsByEnvironment || {})) {
    if (!Array.isArray(ids) || !targetAppId) continue;
    const environment = await getPool().query<{ id: string }>(
      `SELECT id FROM target_app_environments WHERE id = $1 AND target_app_id = $2`,
      [environmentId, targetAppId],
    );
    if (!environment.rows[0]) {
      throw new Error("One or more selected environments do not belong to this orchestration's target application");
    }
    for (const id of ids) {
      const credential = byId.get(String(id));
      if (!credential || credential.target_app_id !== targetAppId || !credential.environment_ids.includes(environmentId)) {
        throw new Error("Each email credential must be linked to its selected target application and environment");
      }
    }
  }
}

// GET - List triggers or get by ID
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const orchestrationId = searchParams.get("orchestrationId");
    const triggerType = searchParams.get("triggerType") as OrchestrationTriggerType | null;
    const status = searchParams.get("status") as TriggerStatus | null;

    // Get single trigger by ID
    if (id) {
      const trigger = await assertTriggerOwnership(session, id);
      return NextResponse.json(trigger);
    }

    if (!orchestrationId) {
      return NextResponse.json({ error: "orchestrationId is required" }, { status: 400 });
    }
    await assertOrchestrationOwnership(session, orchestrationId);

    // List triggers with filters
    const filters: any = { orchestrationId };
    if (triggerType) filters.triggerType = triggerType;
    if (status) filters.status = status;

    const triggers = await getTriggers(filters);
    return NextResponse.json({ triggers });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error getting triggers:", error);
    return NextResponse.json(
      { error: "Failed to get triggers" },
      { status: 500 }
    );
  }
}

// POST - Create new trigger
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { orchestrationId, triggerType, name, description, config } = body;

    if (!orchestrationId || !triggerType || !name || !config) {
      return NextResponse.json(
        { error: "orchestrationId, triggerType, name, and config are required" },
        { status: 400 }
      );
    }

    const orchestration = await assertOrchestrationOwnership(session, orchestrationId);

    const finalConfig = config as TriggerConfig;

    // Validate trigger config
    const validation = validateTriggerConfig(triggerType, finalConfig);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid trigger configuration", details: validation.errors },
        { status: 400 }
      );
    }

    await assertEmailCredentialsBelongToCompany(finalConfig, orchestration.companyId, orchestration.targetAppId ?? null);

    const trigger = await createTrigger({
      orchestrationId,
      triggerType,
      name,
      description,
      config: finalConfig,
      createdById: session.user.id,
    });

    // Clear cache if chatbot trigger was created
    if (triggerType === 'chatbot') {
      clearTriggerCache();
    }

    return NextResponse.json(trigger, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const databaseError = mapDatabaseInputError(error);
    if (databaseError) return NextResponse.json({ error: databaseError.message }, { status: databaseError.statusCode });
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error creating trigger:", error);

    const message = error instanceof Error ? error.message : "Failed to create trigger";
    if (
      message.toLowerCase().includes("short name already in use") ||
      message.toLowerCase().includes("duplicate")
    ) {
      return NextResponse.json(
        { error: "Duplicate endpoint name" },
        { status: 409 }
      );
    }
    if (message.toLowerCase().includes("does not belong to this company")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to create trigger" },
      { status: 500 }
    );
  }
}

// PUT - Update trigger
export async function PUT(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, config, status } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existingTrigger = await assertTriggerOwnership(session, id);
    const orchestration = await assertOrchestrationOwnership(session, existingTrigger.orchestrationId);

    const updates: any = { updatedById: session.user.id };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (config !== undefined) {
      // Validate if config is provided
      const validation = validateTriggerConfig(existingTrigger.triggerType, config as TriggerConfig);
      if (!validation.valid) {
        return NextResponse.json(
          { error: "Invalid trigger configuration", details: validation.errors },
          { status: 400 }
        );
      }
      await assertEmailCredentialsBelongToCompany(config, orchestration.companyId, orchestration.targetAppId ?? null);
      updates.config = config;
    }
    if (status !== undefined) updates.status = status;

    const trigger = await updateTrigger(id, updates);

    // Clear cache if chatbot trigger was updated
    if (trigger.triggerType === 'chatbot') {
      clearTriggerCache();
    }

    return NextResponse.json(trigger);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const databaseError = mapDatabaseInputError(error);
    if (databaseError) return NextResponse.json({ error: databaseError.message }, { status: databaseError.statusCode });
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating trigger:", error);

    const message = error instanceof Error ? error.message : "Failed to update trigger";
    if (
      message.toLowerCase().includes("short name already in use") ||
      message.toLowerCase().includes("duplicate")
    ) {
      return NextResponse.json(
        { error: "Duplicate endpoint name" },
        { status: 409 }
      );
    }
    if (message.toLowerCase().includes("does not belong to this company")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to update trigger" },
      { status: 500 }
    );
  }
}

// DELETE - Delete trigger
export async function DELETE(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Get trigger type before deletion to check if cache needs clearing
    const trigger = await assertTriggerOwnership(session, id);
    const wasChatbotTrigger = trigger.triggerType === 'chatbot';

    await deleteTrigger(id);

    // Clear cache if chatbot trigger was deleted
    if (wasChatbotTrigger) {
      clearTriggerCache();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting trigger:", error);
    return NextResponse.json(
      { error: "Failed to delete trigger" },
      { status: 500 }
    );
  }
}
