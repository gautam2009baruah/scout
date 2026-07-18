import { getPool } from "@/lib/db/pool";
import type { AdminSession } from "./auth";
import { listGuidedWorkflowTargetApps } from "./guided-workflows";

export type SupportedDatabaseType =
  | "sqlserver"
  | "oracle"
  | "postgresql"
  | "mysql"
  | "sqlite"
  | "other";

export type DatabaseSchemaColumn = {
  name: string;
  type?: string;
  nullable?: boolean;
  description?: string;
  isExposed?: boolean;
};

export type DatabaseSchemaForeignKey = {
  name?: string;
  column: string;
  referencesTable: string;
  referencesColumn: string;
};

export type DatabaseSchemaTable = {
  name: string;
  description?: string;
  isExposed?: boolean;
  columns: DatabaseSchemaColumn[];
  foreignKeys?: DatabaseSchemaForeignKey[];
};

export type DatabaseSchemaDocument = {
  tables: DatabaseSchemaTable[];
};

export type TargetAppDatabaseSchemaRecord = {
  id: string;
  targetAppId: string;
  targetAppName: string;
  databaseName: string;
  databaseType: SupportedDatabaseType;
  databaseDescription: string | null;
  version: number;
  isActive: boolean;
  schema: DatabaseSchemaDocument;
  createdAt: string;
  updatedAt: string;
  uploadedAt: string;
  createdById: string | null;
  updatedById: string | null;
};

export class DatabaseSchemaAdminError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DatabaseSchemaAdminError";
    this.statusCode = statusCode;
  }
}

function normalizeIdentifier(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDatabaseType(value: unknown): SupportedDatabaseType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "sqlserver" ||
    normalized === "oracle" ||
    normalized === "postgresql" ||
    normalized === "mysql" ||
    normalized === "sqlite"
  ) {
    return normalized;
  }
  return "other";
}

function normalizeSchemaDocument(input: unknown): DatabaseSchemaDocument {
  const payload = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawTables = Array.isArray(payload.tables) ? payload.tables : [];

  const tables: DatabaseSchemaTable[] = rawTables
    .map<DatabaseSchemaTable | null>((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const tableName = normalizeIdentifier(row.name);
      if (!tableName) return null;

      const rawColumns = Array.isArray(row.columns) ? row.columns : [];
      const columns: DatabaseSchemaColumn[] = rawColumns
        .map<DatabaseSchemaColumn | null>((columnItem) => {
          const col = (columnItem && typeof columnItem === "object" ? columnItem : {}) as Record<string, unknown>;
          const columnName = normalizeIdentifier(col.name);
          if (!columnName) return null;

          return {
            name: columnName,
            type: normalizeIdentifier(col.type) || undefined,
            nullable: col.nullable === undefined ? undefined : col.nullable === true,
            description: normalizeIdentifier(col.description) || undefined,
            isExposed: col.isExposed === false ? false : true,
          };
        })
        .filter((column): column is DatabaseSchemaColumn => Boolean(column));

      const rawForeignKeys = Array.isArray(row.foreignKeys) ? row.foreignKeys : [];
      const foreignKeys: DatabaseSchemaForeignKey[] = rawForeignKeys
        .map<DatabaseSchemaForeignKey | null>((fkItem) => {
          const fk = (fkItem && typeof fkItem === "object" ? fkItem : {}) as Record<string, unknown>;
          const column = normalizeIdentifier(fk.column);
          const referencesTable = normalizeIdentifier(fk.referencesTable);
          const referencesColumn = normalizeIdentifier(fk.referencesColumn);
          if (!column || !referencesTable || !referencesColumn) return null;

          return {
            name: normalizeIdentifier(fk.name) || undefined,
            column,
            referencesTable,
            referencesColumn,
          };
        })
        .filter((foreignKey): foreignKey is DatabaseSchemaForeignKey => Boolean(foreignKey));

      return {
        name: tableName,
        description: normalizeIdentifier(row.description) || undefined,
        isExposed: row.isExposed === false ? false : true,
        columns,
        foreignKeys,
      };
    })
    .filter((table): table is DatabaseSchemaTable => Boolean(table));

  if (tables.length === 0) {
    throw new DatabaseSchemaAdminError("Schema must include at least one table.", 400);
  }

  return { tables };
}

function mapRecord(row: {
  id: string;
  target_app_id: string;
  target_app_name: string;
  database_name: string;
  database_type: SupportedDatabaseType;
  database_description: string | null;
  version: number;
  is_active: boolean;
  schema_json: DatabaseSchemaDocument;
  created_at: Date;
  updated_at: Date;
  uploaded_at: Date;
  created_by: string | null;
  updated_by: string | null;
}): TargetAppDatabaseSchemaRecord {
  return {
    id: row.id,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    databaseName: row.database_name,
    databaseType: row.database_type,
    databaseDescription: row.database_description,
    version: row.version,
    isActive: row.is_active,
    schema: normalizeSchemaDocument(row.schema_json),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    uploadedAt: row.uploaded_at.toISOString(),
    createdById: row.created_by,
    updatedById: row.updated_by,
  };
}

async function assertTargetAppAccess(session: AdminSession, targetAppId: string) {
  const targetApps = await listGuidedWorkflowTargetApps(session);
  const allowed = targetApps.find((item) => item.id === targetAppId && item.companyId === session.user.tenantId);
  if (!allowed) {
    throw new DatabaseSchemaAdminError("Selected target application is unavailable.", 400);
  }
  return allowed;
}
function buildTableMap(schema: DatabaseSchemaDocument) {
  const map = new Map<string, DatabaseSchemaTable>();
  for (const table of schema.tables) {
    map.set(table.name.toLowerCase(), table);
  }
  return map;
}

function validateDeletionConstraints(previous: DatabaseSchemaDocument, next: DatabaseSchemaDocument) {
  const previousTables = buildTableMap(previous);
  const nextTables = buildTableMap(next);

  const removedTables = new Set(
    Array.from(previousTables.keys()).filter((tableName) => !nextTables.has(tableName))
  );

  const removedColumns = new Map<string, Set<string>>();
  for (const [tableName, previousTable] of previousTables.entries()) {
    const nextTable = nextTables.get(tableName);
    if (!nextTable) continue;

    const nextColumnNames = new Set(nextTable.columns.map((column) => column.name.toLowerCase()));
    const deleted = previousTable.columns
      .map((column) => column.name.toLowerCase())
      .filter((columnName) => !nextColumnNames.has(columnName));

    if (deleted.length > 0) {
      removedColumns.set(tableName, new Set(deleted));
    }
  }

  for (const table of nextTables.values()) {
    for (const fk of table.foreignKeys || []) {
      const refTable = fk.referencesTable.toLowerCase();
      const refColumn = fk.referencesColumn.toLowerCase();

      if (removedTables.has(refTable)) {
        throw new DatabaseSchemaAdminError(
          `Cannot delete table \"${fk.referencesTable}\" because table \"${table.name}\" has foreign key \"${fk.name || `${table.name}_${fk.column}_fk`}\" referencing it.`,
          409
        );
      }

      const removedForTable = removedColumns.get(refTable);
      if (removedForTable?.has(refColumn)) {
        throw new DatabaseSchemaAdminError(
          `Cannot delete column \"${fk.referencesTable}.${fk.referencesColumn}\" because table \"${table.name}\" has foreign key \"${fk.name || `${table.name}_${fk.column}_fk`}\" referencing it.`,
          409
        );
      }
    }
  }
}

export async function getDatabaseSchemaAdminPayload(session: AdminSession) {
  const targetApps = await listGuidedWorkflowTargetApps(session);
  const companyTargetApps = targetApps.filter((app) => app.companyId === session.user.tenantId);

  const schemasResult = await getPool().query<{
    id: string;
    target_app_id: string;
    target_app_name: string;
    database_name: string;
    database_type: SupportedDatabaseType;
    database_description: string | null;
    version: number;
    is_active: boolean;
    schema_json: DatabaseSchemaDocument;
    created_at: Date;
    updated_at: Date;
    uploaded_at: Date;
    created_by: string | null;
    updated_by: string | null;
  }>(
    `
      SELECT
        schemas.id,
        schemas.target_app_id,
        gta.name AS target_app_name,
        schemas.database_name,
        schemas.database_type,
        schemas.database_description,
        schemas.version,
        schemas.is_active,
        schemas.schema_json,
        schemas.created_at,
        schemas.updated_at,
        schemas.uploaded_at,
        schemas.created_by,
        schemas.updated_by
      FROM target_app_database_schemas schemas
      INNER JOIN guided_workflow_target_apps gta ON gta.id = schemas.target_app_id
      INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
      WHERE cta.company_id = $1
        AND cta.deleted_at IS NULL
        AND schemas.deleted_at IS NULL
      ORDER BY schemas.updated_at DESC
    `,
    [session.user.tenantId]
  );

  return {
    targetApps: companyTargetApps.map((app) => ({
      id: app.id,
      name: app.name,
      companyId: app.companyId,
    })),
    schemas: schemasResult.rows.map(mapRecord),
  };
}

export async function getDatabaseSchemaById(session: AdminSession, schemaId: string) {
  const result = await getPool().query<{
    id: string;
    target_app_id: string;
    target_app_name: string;
    database_name: string;
    database_type: SupportedDatabaseType;
    database_description: string | null;
    version: number;
    is_active: boolean;
    schema_json: DatabaseSchemaDocument;
    created_at: Date;
    updated_at: Date;
    uploaded_at: Date;
    created_by: string | null;
    updated_by: string | null;
  }>(
    `
      SELECT
        schemas.id,
        schemas.target_app_id,
        gta.name AS target_app_name,
        schemas.database_name,
        schemas.database_type,
        schemas.database_description,
        schemas.version,
        schemas.is_active,
        schemas.schema_json,
        schemas.created_at,
        schemas.updated_at,
        schemas.uploaded_at,
        schemas.created_by,
        schemas.updated_by
      FROM target_app_database_schemas schemas
      INNER JOIN guided_workflow_target_apps gta ON gta.id = schemas.target_app_id
      INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
      WHERE schemas.id = $1
        AND cta.company_id = $2
        AND cta.deleted_at IS NULL
        AND schemas.deleted_at IS NULL
      LIMIT 1
    `,
    [schemaId, session.user.tenantId]
  );

  return result.rows[0] ? mapRecord(result.rows[0]) : null;
}

export async function uploadDatabaseSchema(
  session: AdminSession,
  input: {
    targetAppId: string;
    databaseName: string;
    databaseType: SupportedDatabaseType;
    databaseDescription?: string | null;
    schema: unknown;
  }
) {
  const targetApp = await assertTargetAppAccess(session, input.targetAppId);
  const databaseName = normalizeIdentifier(input.databaseName);
  const databaseDescription = normalizeIdentifier(input.databaseDescription || "") || null;

  if (!databaseName) {
    throw new DatabaseSchemaAdminError("Database name is required.", 400);
  }

  const schema = normalizeSchemaDocument(input.schema);
  const databaseType = normalizeDatabaseType(input.databaseType);

  const duplicateResult = await getPool().query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM target_app_database_schemas
        WHERE target_app_id = $1
          AND lower(database_name) = lower($2)
          AND deleted_at IS NULL
      ) AS exists
    `,
    [targetApp.id, databaseName]
  );

  if (duplicateResult.rows[0]?.exists) {
    throw new DatabaseSchemaAdminError(
      "Duplicate database name for this target app is not allowed. Use Edit from the list.",
      409
    );
  }

  const result = await getPool().query<{
    id: string;
    target_app_id: string;
    target_app_name: string;
    database_name: string;
    database_type: SupportedDatabaseType;
    database_description: string | null;
    version: number;
    is_active: boolean;
    schema_json: DatabaseSchemaDocument;
    created_at: Date;
    updated_at: Date;
    uploaded_at: Date;
    created_by: string | null;
    updated_by: string | null;
  }>(
    `
      INSERT INTO target_app_database_schemas (
        target_app_id,
        database_name,
        database_type,
        database_description,
        version,
        is_active,
        schema_json,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, 1, true, $5::jsonb, $6, $6)
      RETURNING
        id,
        target_app_id,
        $7::text AS target_app_name,
        database_name,
        database_type,
        database_description,
        version,
        is_active,
        schema_json,
        created_at,
        updated_at,
        uploaded_at,
        created_by,
        updated_by
    `,
    [
      targetApp.id,
      databaseName,
      databaseType,
      databaseDescription,
      JSON.stringify(schema),
      session.user.id,
      targetApp.name,
    ]
  );

  return mapRecord(result.rows[0]);
}

export async function updateDatabaseSchema(
  session: AdminSession,
  input: {
    schemaId: string;
    databaseName: string;
    databaseType: SupportedDatabaseType;
    databaseDescription?: string | null;
    schema: unknown;
  }
) {
  const existing = await getDatabaseSchemaById(session, input.schemaId);
  if (!existing) {
    throw new DatabaseSchemaAdminError("Schema record not found.", 404);
  }

  const databaseName = normalizeIdentifier(input.databaseName);
  const databaseDescription = normalizeIdentifier(input.databaseDescription || "") || null;
  if (!databaseName) {
    throw new DatabaseSchemaAdminError("Database name is required.", 400);
  }

  const duplicateResult = await getPool().query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM target_app_database_schemas
        WHERE target_app_id = $1
          AND id <> $2
          AND lower(database_name) = lower($3)
          AND deleted_at IS NULL
      ) AS exists
    `,
    [existing.targetAppId, existing.id, databaseName]
  );

  if (duplicateResult.rows[0]?.exists) {
    throw new DatabaseSchemaAdminError(
      "Duplicate database name for this target app is not allowed.",
      409
    );
  }

  const nextSchema = normalizeSchemaDocument(input.schema);
  validateDeletionConstraints(existing.schema, nextSchema);

  const result = await getPool().query<{
    id: string;
    target_app_id: string;
    target_app_name: string;
    database_name: string;
    database_type: SupportedDatabaseType;
    database_description: string | null;
    version: number;
    is_active: boolean;
    schema_json: DatabaseSchemaDocument;
    created_at: Date;
    updated_at: Date;
    uploaded_at: Date;
    created_by: string | null;
    updated_by: string | null;
  }>(
    `
      UPDATE target_app_database_schemas schemas
      SET
        database_name = $1,
        database_type = $2,
        database_description = $3,
        schema_json = $4::jsonb,
        updated_by = $5,
        updated_at = now()
      FROM guided_workflow_target_apps gta
      WHERE schemas.id = $6
        AND schemas.target_app_id = gta.id
      RETURNING
        schemas.id,
        schemas.target_app_id,
        gta.name AS target_app_name,
        schemas.database_name,
        schemas.database_type,
        schemas.database_description,
        schemas.version,
        schemas.is_active,
        schemas.schema_json,
        schemas.created_at,
        schemas.updated_at,
        schemas.uploaded_at,
        schemas.created_by,
        schemas.updated_by
    `,
    [
      databaseName,
      normalizeDatabaseType(input.databaseType),
      databaseDescription,
      JSON.stringify(nextSchema),
      session.user.id,
      existing.id,
    ]
  );

  if (!result.rows[0]) {
    throw new DatabaseSchemaAdminError("Unable to update schema.", 500);
  }

  return mapRecord(result.rows[0]);
}

export async function deleteDatabaseSchema(session: AdminSession, schemaId: string) {
  const existing = await getDatabaseSchemaById(session, schemaId);
  if (!existing) {
    throw new DatabaseSchemaAdminError("Schema record not found.", 404);
  }

  await getPool().query(
    `
      UPDATE target_app_database_schemas
      SET
        deleted_at = now(),
        is_active = false,
        deactivated_at = now(),
        updated_by = $2,
        updated_at = now()
      WHERE id = $1
    `,
    [existing.id, session.user.id]
  );
}

export function parseUploadedSchemaText(rawText: string): DatabaseSchemaDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new DatabaseSchemaAdminError(
      "Schema file must be valid JSON. Upload a schema-only JSON export (no data).",
      400
    );
  }

  const payload = parsed as Record<string, unknown>;

  if (payload && typeof payload === "object" && payload.schema && typeof payload.schema === "object") {
    return normalizeSchemaDocument(payload.schema);
  }

  if (payload && typeof payload === "object" && payload.tables && !Array.isArray(payload.tables) && typeof payload.tables === "object") {
    const mappedTables = Object.entries(payload.tables as Record<string, unknown>).map(([tableName, tableValue]) => {
      const row = (tableValue && typeof tableValue === "object" ? tableValue : {}) as Record<string, unknown>;
      const rawColumns = Array.isArray(row.columns) ? row.columns : [];
      const columns = rawColumns
        .map((columnItem) => {
          const col = (columnItem && typeof columnItem === "object" ? columnItem : {}) as Record<string, unknown>;
          return {
            name: normalizeIdentifier(col.name || col.column_name),
            type: normalizeIdentifier(col.type || col.data_type),
            nullable: col.nullable === undefined ? undefined : col.nullable === true,
            description: normalizeIdentifier(col.description),
            isExposed: col.isExposed === false ? false : true,
          };
        })
        .filter((column) => column.name);

      const rawForeignKeys = Array.isArray(row.foreignKeys) ? row.foreignKeys : [];
      const foreignKeys = rawForeignKeys
        .map((fkItem) => {
          const fk = (fkItem && typeof fkItem === "object" ? fkItem : {}) as Record<string, unknown>;
          return {
            name: normalizeIdentifier(fk.name),
            column: normalizeIdentifier(fk.column),
            referencesTable: normalizeIdentifier(fk.referencesTable),
            referencesColumn: normalizeIdentifier(fk.referencesColumn),
          };
        })
        .filter((fk) => fk.column && fk.referencesTable && fk.referencesColumn);

      return {
        name: tableName,
        description: normalizeIdentifier(row.description) || undefined,
        isExposed: row.isExposed === false ? false : true,
        columns,
        foreignKeys,
      };
    });

    return normalizeSchemaDocument({ tables: mappedTables });
  }

  return normalizeSchemaDocument(payload);
}
