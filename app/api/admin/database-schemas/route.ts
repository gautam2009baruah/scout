import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  DatabaseSchemaAdminError,
  getActiveDatabaseSchema,
  getDatabaseSchemaAdminPayload,
  listDatabaseSchemaHistory,
  parseUploadedSchemaText,
  updateActiveDatabaseSchema,
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
  const targetAppId = url.searchParams.get("targetAppId") || "";
  const databaseName = url.searchParams.get("databaseName") || "";

  try {
    if (!targetAppId || !databaseName) {
      return NextResponse.json(await getDatabaseSchemaAdminPayload(session));
    }

    const [active, history] = await Promise.all([
      getActiveDatabaseSchema(session, targetAppId, databaseName),
      listDatabaseSchemaHistory(session, targetAppId, databaseName),
    ]);

    return NextResponse.json({ active, history });
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

    const record = await updateActiveDatabaseSchema(session, {
      targetAppId: String(body.targetAppId || ""),
      databaseName: String(body.databaseName || ""),
      databaseType: body.databaseType,
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
