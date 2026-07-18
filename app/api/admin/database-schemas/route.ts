import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  getActiveDatabaseSchemasForTargetApp,
  DatabaseSchemaAdminError,
  deleteDatabaseSchema,
  getDatabaseSchemaById,
  getDatabaseSchemaAdminPayload,
  parseUploadedSchemaText,
  updateDatabaseSchema,
  uploadDatabaseSchema,
} from "@/lib/admin/database-schemas";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ message: "Authentication required." }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ message: "You do not have permission to manage database schemas." }, { status: 403 });
}

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return unauthorized();
  if (!hasModuleAccess(session, MODULE_KEYS.databaseSchemaManager)) return forbidden();

  const url = new URL(request.url);
  const schemaId = url.searchParams.get("schemaId") || "";
  const targetAppId = url.searchParams.get("targetAppId") || "";
  const activeOnly = url.searchParams.get("activeOnly") === "1";

  try {
    if (activeOnly) {
      if (!targetAppId) {
        return NextResponse.json({ message: "targetAppId is required when activeOnly=1" }, { status: 400 });
      }
      const schemas = await getActiveDatabaseSchemasForTargetApp(session, targetAppId);
      return NextResponse.json({ schemas });
    }

    if (!schemaId) {
      return NextResponse.json(await getDatabaseSchemaAdminPayload(session));
    }

    const schema = await getDatabaseSchemaById(session, schemaId);
    return NextResponse.json({ schema });
  } catch (error) {
    if (error instanceof DatabaseSchemaAdminError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ message: "Unable to load database schema configuration." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return unauthorized();
  if (!hasModuleAccess(session, MODULE_KEYS.databaseSchemaManager)) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Schema payload is required." }, { status: 400 });
  }

  try {
    const schema = typeof body.schemaText === "string" ? parseUploadedSchemaText(body.schemaText) : body.schema;

    const record = await uploadDatabaseSchema(session, {
      targetAppId: String(body.targetAppId || ""),
      databaseName: String(body.databaseName || ""),
      databaseType: body.databaseType,
      databaseDescription: body.databaseDescription,
      schema,
    });

    return NextResponse.json({ schema: record }, { status: 201 });
  } catch (error) {
    if (error instanceof DatabaseSchemaAdminError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to upload schema." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return unauthorized();
  if (!hasModuleAccess(session, MODULE_KEYS.databaseSchemaManager)) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Schema payload is required." }, { status: 400 });
  }

  try {
    const schema = typeof body.schemaText === "string" ? parseUploadedSchemaText(body.schemaText) : body.schema;

    const record = await updateDatabaseSchema(session, {
      schemaId: String(body.schemaId || ""),
      databaseName: String(body.databaseName || ""),
      databaseType: body.databaseType,
      databaseDescription: body.databaseDescription,
      schema,
    });

    return NextResponse.json({ schema: record });
  } catch (error) {
    if (error instanceof DatabaseSchemaAdminError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to update schema." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return unauthorized();
  if (!hasModuleAccess(session, MODULE_KEYS.databaseSchemaManager)) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Schema id is required." }, { status: 400 });
  }

  try {
    const schemaId = String(body.schemaId || "").trim();
    if (!schemaId) {
      return NextResponse.json({ message: "Schema id is required." }, { status: 400 });
    }

    await deleteDatabaseSchema(session, schemaId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof DatabaseSchemaAdminError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to delete schema." }, { status: 500 });
  }
}
