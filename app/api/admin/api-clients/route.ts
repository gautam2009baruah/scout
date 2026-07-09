// API Client Management Endpoint
// Handles CRUD operations for API clients

import { NextRequest, NextResponse } from "next/server";
import {
  createAPIClient,
  getAPIClients,
  getAPIClientById,
  updateAPIClient,
  deleteAPIClient,
  regenerateAPIKey,
} from "@/lib/orchestrations/triggers";
import { getCurrentAdminSession } from "@/lib/admin/session";

// GET - List API clients or get by ID
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const isActive = searchParams.get("isActive");

    // Get single client by ID
    if (id) {
      const client = await getAPIClientById(id);
      if (!client) {
        return NextResponse.json({ error: "API client not found" }, { status: 404 });
      }
      return NextResponse.json(client);
    }

    // List clients with filters
    const filters: any = {};
    if (isActive !== null) {
      filters.isActive = isActive === "true";
    }

    const clients = await getAPIClients(filters);
    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Error getting API clients:", error);
    return NextResponse.json(
      { error: "Failed to get API clients" },
      { status: 500 }
    );
  }
}

// POST - Create new API client
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, rateLimit, allowedOrchestrations } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const client = await createAPIClient({
      name,
      description,
      rateLimit,
      allowedOrchestrations,
      createdById: session.user.id,
    });

    return NextResponse.json({
      ...client,
      message: "API client created. Save the API key securely - it will not be shown again.",
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating API client:", error);
    return NextResponse.json(
      { error: "Failed to create API client" },
      { status: 500 }
    );
  }
}

// PUT - Update API client
export async function PUT(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, isActive, rateLimit, allowedOrchestrations } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (isActive !== undefined) updates.isActive = isActive;
    if (rateLimit !== undefined) updates.rateLimit = rateLimit;
    if (allowedOrchestrations !== undefined) updates.allowedOrchestrations = allowedOrchestrations;

    const client = await updateAPIClient(id, updates);
    return NextResponse.json(client);
  } catch (error) {
    console.error("Error updating API client:", error);
    return NextResponse.json(
      { error: "Failed to update API client" },
      { status: 500 }
    );
  }
}

// DELETE - Delete API client
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

    await deleteAPIClient(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting API client:", error);
    return NextResponse.json(
      { error: "Failed to delete API client" },
      { status: 500 }
    );
  }
}
