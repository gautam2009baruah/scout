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
} from "@/lib/orchestrations/triggers";
import type { TriggerConfig, OrchestrationTriggerType, TriggerStatus } from "@/shared/orchestrationTypes";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { clearTriggerCache } from "@/lib/orchestrations/chatbot-trigger-matcher";

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
      const trigger = await getTriggerById(id);
      if (!trigger) {
        return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
      }
      return NextResponse.json(trigger);
    }

    // List triggers with filters
    const filters: any = {};
    if (orchestrationId) filters.orchestrationId = orchestrationId;
    if (triggerType) filters.triggerType = triggerType;
    if (status) filters.status = status;

    const triggers = await getTriggers(filters);
    return NextResponse.json({ triggers });
  } catch (error) {
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

    const finalConfig = config as TriggerConfig;

    // Validate trigger config
    const validation = validateTriggerConfig(triggerType, finalConfig);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid trigger configuration", details: validation.errors },
        { status: 400 }
      );
    }

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

    const updates: any = { updatedById: session.user.id };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (config !== undefined) {
      // Validate if config is provided
      const trigger = await getTriggerById(id);
      if (trigger) {
        const validation = validateTriggerConfig(trigger.triggerType, config as TriggerConfig);
        if (!validation.valid) {
          return NextResponse.json(
            { error: "Invalid trigger configuration", details: validation.errors },
            { status: 400 }
          );
        }
      }
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
    const trigger = await getTriggerById(id);
    const wasChatbotTrigger = trigger?.triggerType === 'chatbot';

    await deleteTrigger(id);
    
    // Clear cache if chatbot trigger was deleted
    if (wasChatbotTrigger) {
      clearTriggerCache();
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting trigger:", error);
    return NextResponse.json(
      { error: "Failed to delete trigger" },
      { status: 500 }
    );
  }
}
