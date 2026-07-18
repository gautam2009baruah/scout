import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  DatabaseSchemaAdminError,
  getDatabaseSchemaById,
  parseUploadedSchemaText,
  updateDatabaseSchema,
} from "@/lib/admin/database-schemas";

export const runtime = "nodejs";

type SyncRequest = {
  schemaId?: string;
  apply?: boolean;
  apiConfig?: {
    endpointUrl?: string;
    method?: string;
    headersJson?: string;
    bodyJson?: string;
    responseSchemaPath?: string;
  };
};

function unauthorized() {
  return NextResponse.json({ message: "Authentication required." }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ message: "You do not have permission to sync database schemas." }, { status: 403 });
}

function pathValue(value: unknown, path: string) {
  if (!path.trim()) return value;
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function normalizeTable(table: { name: string; columns?: Array<{ name: string }>; foreignKeys?: Array<{ column: string; referencesTable: string; referencesColumn: string }> }) {
  return {
    name: table.name,
    columns: (table.columns || []).map((column) => column.name.toLowerCase()).sort(),
    foreignKeys: (table.foreignKeys || [])
      .map((foreignKey) => `${foreignKey.column.toLowerCase()}->${foreignKey.referencesTable.toLowerCase()}.${foreignKey.referencesColumn.toLowerCase()}`)
      .sort(),
  };
}

function compareSchemas(currentSchema: { tables: Array<{ name: string; columns?: Array<{ name: string }>; foreignKeys?: Array<{ column: string; referencesTable: string; referencesColumn: string }> }> }, latestSchema: { tables: Array<{ name: string; columns?: Array<{ name: string }>; foreignKeys?: Array<{ column: string; referencesTable: string; referencesColumn: string }> }> }) {
  const currentTables = new Map(currentSchema.tables.map((table) => [table.name.toLowerCase(), normalizeTable(table)]));
  const latestTables = new Map(latestSchema.tables.map((table) => [table.name.toLowerCase(), normalizeTable(table)]));

  const addedTables: string[] = [];
  const removedTables: string[] = [];
  const changedTables: Array<{ name: string; addedColumns: string[]; removedColumns: string[]; foreignKeysChanged: boolean }> = [];

  for (const [name, table] of latestTables.entries()) {
    if (!currentTables.has(name)) {
      addedTables.push(table.name);
      continue;
    }

    const currentTable = currentTables.get(name)!;
    const addedColumns = table.columns.filter((column) => !currentTable.columns.includes(column));
    const removedColumns = currentTable.columns.filter((column) => !table.columns.includes(column));
    const foreignKeysChanged = table.foreignKeys.join("|") !== currentTable.foreignKeys.join("|");

    if (addedColumns.length || removedColumns.length || foreignKeysChanged) {
      changedTables.push({
        name: table.name,
        addedColumns,
        removedColumns,
        foreignKeysChanged,
      });
    }
  }

  for (const [name, table] of currentTables.entries()) {
    if (!latestTables.has(name)) {
      removedTables.push(table.name);
    }
  }

  return {
    changed: addedTables.length > 0 || removedTables.length > 0 || changedTables.length > 0,
    addedTables,
    removedTables,
    changedTables,
  };
}

async function parseRemoteSchema(response: Response, responseSchemaPath: string) {
  const body = await response.json().catch(() => null);
  if (!body) {
    throw new Error("Remote API must return JSON.");
  }

  const candidate = pathValue(body, responseSchemaPath) ?? body.schema ?? body.metadata?.schema ?? body.tables ?? body;
  return parseUploadedSchemaText(JSON.stringify(candidate));
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return unauthorized();
  if (!hasModuleAccess(session, MODULE_KEYS.databaseSchemaManager)) return forbidden();

  const body = (await request.json().catch(() => null)) as SyncRequest | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Sync payload is required." }, { status: 400 });
  }

  const schemaId = String(body.schemaId || "").trim();
  if (!schemaId) {
    return NextResponse.json({ message: "schemaId is required." }, { status: 400 });
  }

  const endpointUrl = String(body.apiConfig?.endpointUrl || "").trim();
  if (!endpointUrl) {
    return NextResponse.json({ message: "API endpoint URL is required." }, { status: 400 });
  }

  const method = String(body.apiConfig?.method || "GET").trim().toUpperCase();
  const responseSchemaPath = String(body.apiConfig?.responseSchemaPath || "schema").trim() || "schema";
  let headers: Record<string, string> = {};
  let requestBody: unknown = undefined;

  try {
    headers = body.apiConfig?.headersJson?.trim() ? JSON.parse(body.apiConfig.headersJson) : {};
  } catch {
    return NextResponse.json({ message: "Headers JSON must be valid JSON." }, { status: 400 });
  }

  if (body.apiConfig?.bodyJson?.trim()) {
    try {
      requestBody = JSON.parse(body.apiConfig.bodyJson);
    } catch {
      return NextResponse.json({ message: "Request body JSON must be valid JSON." }, { status: 400 });
    }
  }

  try {
    const existing = await getDatabaseSchemaById(session, schemaId);
    if (!existing) {
      return NextResponse.json({ message: "Schema record not found." }, { status: 404 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(endpointUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: method === "GET" || method === "HEAD" ? undefined : requestBody === undefined ? undefined : JSON.stringify(requestBody),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return NextResponse.json(
        { message: `Remote API returned ${response.status}. ${errorText || response.statusText}`.trim() },
        { status: 400 }
      );
    }

    const latestSchema = await parseRemoteSchema(response, responseSchemaPath);
    const comparison = compareSchemas(existing.schema, latestSchema);

    if (!comparison.changed) {
      return NextResponse.json({
        changed: false,
        message: "Schema is already in sync.",
        comparison,
        currentSchema: existing.schema,
        latestSchema,
      });
    }

    if (!body.apply) {
      return NextResponse.json({
        changed: true,
        message: "Remote schema differs from the saved schema.",
        comparison,
        currentSchema: existing.schema,
        latestSchema,
      });
    }

    const updated = await updateDatabaseSchema(session, {
      schemaId: existing.id,
      databaseName: existing.databaseName,
      databaseType: existing.databaseType,
      databaseDescription: existing.databaseDescription,
      schema: latestSchema,
    });

    return NextResponse.json({
      changed: true,
      synced: true,
      message: "Schema synced successfully.",
      comparison,
      currentSchema: existing.schema,
      latestSchema,
      schema: updated,
    });
  } catch (error) {
    if (error instanceof DatabaseSchemaAdminError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    const message = error instanceof Error && error.name === "AbortError"
      ? "Remote API request timed out."
      : error instanceof Error
        ? error.message
        : "Unable to sync schema.";

    return NextResponse.json({ message }, { status: 500 });
  }
}
