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
  companyId: string;
  targetAppId: string;
  targetAppName: string;
  databaseName: string;
  databaseType: SupportedDatabaseType;
  version: number;
  isActive: boolean;
  schema: DatabaseSchemaDocument;
  createdAt: string;
  updatedAt: string;
  uploadedAt: string;
  createdById: string | null;
  updatedById: string | null;
};

export type DatabaseSchemaCatalogEntry = {
  targetAppId: string;
  targetAppName: string;
  databaseName: string;
  databaseType: SupportedDatabaseType;
  activeVersion: number;
  activeSchemaId: string;
  updatedAt: string;
  historyCount: number;
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
  company_id: string;
  target_app_id: string;
  target_app_name: string;
  database_name: string;
  database_type: SupportedDatabaseType;
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
    companyId: row.company_id,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    databaseName: row.database_name,
    databaseType: row.database_type,
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

export async function getDatabaseSchemaAdminPayload(session: AdminSession) {
  const targetApps = await listGuidedWorkflowTargetApps(session);
  const companyTargetApps = targetApps.filter((app) => app.companyId === session.user.tenantId);

  const catalogResult = await getPool().query<{
    target_app_id: string;
    target_app_name: string;
    database_name: string;
    database_type: SupportedDatabaseType;
    active_version: number;
    active_schema_id: string;
    updated_at: Date;
    history_count: string;
  }>(
    `
      SELECT
        active.target_app_id,
        cta.name AS target_app_name,
        active.database_name,
        active.database_type,
        active.version AS active_version,
        active.id AS active_schema_id,
        active.updated_at,
        (
          SELECT COUNT(*)::text
          FROM target_app_database_schemas history
          WHERE history.target_app_id = active.target_app_id
            AND history.database_name = active.database_name
            AND history.deleted_at IS NULL
        ) AS history_count
      FROM target_app_database_schemas active
      INNER JOIN guided_workflow_target_apps gta ON gta.id = active.target_app_id
      INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
      WHERE active.company_id = $1
        AND active.is_active = true
        AND active.deleted_at IS NULL
      ORDER BY cta.name ASC, active.database_name ASC
    `,
    [session.user.tenantId]
  );

  const catalog: DatabaseSchemaCatalogEntry[] = catalogResult.rows.map((row) => ({
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    databaseName: row.database_name,
    databaseType: row.database_type,
    activeVersion: row.active_version,
    activeSchemaId: row.active_schema_id,
    updatedAt: row.updated_at.toISOString(),
    historyCount: Number(row.history_count || "0"),
  }));

  return {
    targetApps: companyTargetApps.map((app) => ({
      id: app.id,
      name: app.name,
      companyId: app.companyId,
    })),
    catalog,
  };
}

export async function getActiveDatabaseSchema(session: AdminSession, targetAppId: string, databaseName: string) {
  await assertTargetAppAccess(session, targetAppId);

  const normalizedName = normalizeIdentifier(databaseName);
  if (!normalizedName) {
    throw new DatabaseSchemaAdminError("Database name is required.", 400);
  }

  const result = await getPool().query<{
    id: string;
    company_id: string;
    target_app_id: string;
    target_app_name: string;
    database_name: string;
    database_type: SupportedDatabaseType;
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
        schemas.*,
        cta.name AS target_app_name
      FROM target_app_database_schemas schemas
      INNER JOIN guided_workflow_target_apps gta ON gta.id = schemas.target_app_id
      INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
      WHERE schemas.company_id = $1
        AND schemas.target_app_id = $2
        AND schemas.database_name = $3
        AND schemas.is_active = true
        AND schemas.deleted_at IS NULL
      ORDER BY schemas.version DESC
      LIMIT 1
    `,
    [session.user.tenantId, targetAppId, normalizedName]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapRecord(result.rows[0]);
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

  for (const [tableName, table] of nextTables.entries()) {
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

export async function uploadDatabaseSchema(
  session: AdminSession,
  input: {
    targetAppId: string;
    databaseName: string;
    databaseType: SupportedDatabaseType;
    schema: unknown;
  }
) {
  const targetApp = await assertTargetAppAccess(session, input.targetAppId);
  const databaseName = normalizeIdentifier(input.databaseName);
  if (!databaseName) {
    throw new DatabaseSchemaAdminError("Database name is required.", 400);
  }

  const schema = normalizeSchemaDocument(input.schema);
  const databaseType = normalizeDatabaseType(input.databaseType);

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const versionResult = await client.query<{ next_version: number }>(
      `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM target_app_database_schemas
        WHERE target_app_id = $1
          AND database_name = $2
          AND deleted_at IS NULL
      `,
      [targetApp.id, databaseName]
    );

    const nextVersion = Number(versionResult.rows[0]?.next_version || 1);

    await client.query(
      `
        UPDATE target_app_database_schemas
        SET
          is_active = false,
          deactivated_at = now(),
          updated_at = now(),
          updated_by = $4
        WHERE target_app_id = $1
          AND database_name = $2
          AND is_active = true
          AND deleted_at IS NULL
      `,
      [targetApp.id, databaseName, session.user.tenantId, session.user.id]
    );

    const insertResult = await client.query<{
      id: string;
      company_id: string;
      target_app_id: string;
      target_app_name: string;
      database_name: string;
      database_type: SupportedDatabaseType;
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
          company_id,
          target_app_id,
          database_name,
          database_type,
          version,
          is_active,
          schema_json,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, true, $6::jsonb, $7, $7)
        RETURNING
          id,
          company_id,
          target_app_id,
          $8::text AS target_app_name,
          database_name,
          database_type,
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
        session.user.tenantId,
        targetApp.id,
        databaseName,
        databaseType,
        nextVersion,
        JSON.stringify(schema),
        session.user.id,
        targetApp.name,
      ]
    );

    await client.query("COMMIT");

    return mapRecord(insertResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateActiveDatabaseSchema(
  session: AdminSession,
  input: {
    targetAppId: string;
    databaseName: string;
    databaseType?: SupportedDatabaseType;
    schema: unknown;
  }
) {
  const targetApp = await assertTargetAppAccess(session, input.targetAppId);
  const databaseName = normalizeIdentifier(input.databaseName);
  if (!databaseName) {
    throw new DatabaseSchemaAdminError("Database name is required.", 400);
  }

  const nextSchema = normalizeSchemaDocument(input.schema);

  const existing = await getActiveDatabaseSchema(session, targetApp.id, databaseName);
  if (!existing) {
    throw new DatabaseSchemaAdminError("No active schema found for this database.", 404);
  }

  validateDeletionConstraints(existing.schema, nextSchema);

  const databaseType = input.databaseType ? normalizeDatabaseType(input.databaseType) : existing.databaseType;

  const result = await getPool().query<{
    id: string;
    company_id: string;
    target_app_id: string;
    target_app_name: string;
    database_name: string;
    database_type: SupportedDatabaseType;
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
        schema_json = $1::jsonb,
        database_type = $2,
        updated_by = $3,
        updated_at = now()
      FROM guided_workflow_target_apps gta
      INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
      WHERE schemas.id = $4
        AND schemas.target_app_id = gta.id
      RETURNING
        schemas.id,
        schemas.company_id,
        schemas.target_app_id,
        cta.name AS target_app_name,
        schemas.database_name,
        schemas.database_type,
        schemas.version,
        schemas.is_active,
        schemas.schema_json,
        schemas.created_at,
        schemas.updated_at,
        schemas.uploaded_at,
        schemas.created_by,
        schemas.updated_by
    `,
    [JSON.stringify(nextSchema), databaseType, session.user.id, existing.id]
  );

  if (!result.rows[0]) {
    throw new DatabaseSchemaAdminError("Unable to update schema.", 500);
  }

  return mapRecord(result.rows[0]);
}

export async function listDatabaseSchemaHistory(session: AdminSession, targetAppId: string, databaseName: string) {
  await assertTargetAppAccess(session, targetAppId);

  const normalizedName = normalizeIdentifier(databaseName);
  if (!normalizedName) {
    throw new DatabaseSchemaAdminError("Database name is required.", 400);
  }

  const result = await getPool().query<{
    id: string;
    company_id: string;
    target_app_id: string;
    target_app_name: string;
    database_name: string;
    database_type: SupportedDatabaseType;
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
        schemas.*,
        cta.name AS target_app_name
      FROM target_app_database_schemas schemas
      INNER JOIN guided_workflow_target_apps gta ON gta.id = schemas.target_app_id
      INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
      WHERE schemas.company_id = $1
        AND schemas.target_app_id = $2
        AND schemas.database_name = $3
        AND schemas.deleted_at IS NULL
      ORDER BY schemas.version DESC
    `,
    [session.user.tenantId, targetAppId, normalizedName]
  );

  return result.rows.map(mapRecord);
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

  // Accept direct { tables: [...] } or { schema: { tables: [...] } } payloads.
  if (payload && typeof payload === "object" && payload.schema && typeof payload.schema === "object") {
    return normalizeSchemaDocument(payload.schema);
  }

  // Accept a table map shape: { tables: { users: { columns: [...] } } }
  if (payload && typeof payload === "object" && payload.tables && !Array.isArray(payload.tables) && typeof payload.tables === "object") {
    const mappedTables = Object.entries(payload.tables as Record<string, unknown>).map(([tableName, tableValue]) => {
      const row = (tableValue && typeof tableValue === "object" ? tableValue : {}) as Record<string, unknown>;
      const rawColumns = Array.isArray(row.columns) ? row.columns : [];
      const columns = rawColumns.map((columnItem) => {
        const col = (columnItem && typeof columnItem === "object" ? columnItem : {}) as Record<string, unknown>;
        return {
          name: normalizeIdentifier(col.name || col.column_name),
          type: normalizeIdentifier(col.type || col.data_type),
          nullable: col.nullable === undefined ? undefined : col.nullable === true,
          description: normalizeIdentifier(col.description),
          isExposed: col.isExposed === false ? false : true,
        };
      }).filter((column) => column.name);

      const rawForeignKeys = Array.isArray(row.foreignKeys) ? row.foreignKeys : [];
      const foreignKeys = rawForeignKeys.map((fkItem) => {
        const fk = (fkItem && typeof fkItem === "object" ? fkItem : {}) as Record<string, unknown>;
        return {
          name: normalizeIdentifier(fk.name),
          column: normalizeIdentifier(fk.column),
          referencesTable: normalizeIdentifier(fk.referencesTable),
          referencesColumn: normalizeIdentifier(fk.referencesColumn),
        };
      }).filter((fk) => fk.column && fk.referencesTable && fk.referencesColumn);

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
