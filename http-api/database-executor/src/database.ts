import { Pool } from "pg";
import mysql from "mysql2/promise";
import sql from "mssql";
import type { AppConfig } from "./config.js";
import type { DatabaseMetadata, DatabaseType, SchemaDocument, SchemaForeignKey, SchemaTable } from "./types.js";

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
  columns: string[];
};

type DatabaseAdapter = {
  query: (sqlText: string) => Promise<QueryResult>;
  metadata: () => Promise<DatabaseMetadata>;
  close: () => Promise<void>;
};

function normalizeName(value: unknown) {
  return String(value ?? "").trim();
}

function createSchemaDocument(tables: Array<SchemaTable>): SchemaDocument {
  return { tables: tables.filter((table) => table.name.trim()) };
}

function groupRows(rows: Array<Record<string, unknown>>) {
  const tables = new Map<string, SchemaTable & { _columnNames: Set<string>; _foreignKeyNames: Set<string> }>();

  for (const row of rows) {
    const tableName = normalizeName(row.table_name || row.TABLE_NAME);
    const schemaName = normalizeName(row.table_schema || row.TABLE_SCHEMA);
    const columnName = normalizeName(row.column_name || row.COLUMN_NAME);
    if (!tableName || !columnName) continue;

    const key = `${schemaName}.${tableName}`.toLowerCase();
    const table = tables.get(key) || {
      name: tableName,
      description: undefined,
      isExposed: true,
      columns: [],
      foreignKeys: [],
      _columnNames: new Set<string>(),
      _foreignKeyNames: new Set<string>(),
    };

    if (!table._columnNames.has(columnName)) {
      table.columns.push({
        name: columnName,
        type: normalizeName(row.data_type || row.TYPE_NAME || row.column_type) || undefined,
        nullable: row.is_nullable === undefined ? undefined : String(row.is_nullable).toLowerCase() === "yes" || row.is_nullable === true,
        isExposed: true,
      });
      table._columnNames.add(columnName);
    }

    const referencesTable = normalizeName(row.references_table || row.REFERENCED_TABLE_NAME);
    const referencesColumn = normalizeName(row.references_column || row.REFERENCED_COLUMN_NAME);
    if (referencesTable && referencesColumn) {
      const foreignKeyName = normalizeName(row.constraint_name || row.CONSTRAINT_NAME) || `${columnName}->${referencesTable}.${referencesColumn}`;
      if (!table._foreignKeyNames.has(foreignKeyName)) {
        table.foreignKeys = table.foreignKeys || [];
        table.foreignKeys.push({
          name: normalizeName(row.constraint_name || row.CONSTRAINT_NAME) || undefined,
          column: columnName,
          referencesTable,
          referencesColumn,
        } satisfies SchemaForeignKey);
        table._foreignKeyNames.add(foreignKeyName);
      }
    }

    tables.set(key, table);
  }

  return createSchemaDocument(Array.from(tables.values()).map((table) => {
    const { _columnNames, _foreignKeyNames, ...cleanTable } = table;
    return {
      ...cleanTable,
      columns: cleanTable.columns.sort((a, b) => a.name.localeCompare(b.name)),
      foreignKeys: (cleanTable.foreignKeys || []).sort((a, b) => a.column.localeCompare(b.column)),
    };
  }));
}

function createPostgresAdapter(config: AppConfig): DatabaseAdapter {
  const pool = new Pool(
    config.databaseUrl
      ? { connectionString: config.databaseUrl, ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined }
      : {
          host: config.dbHost,
          port: config.dbPort,
          user: config.dbUser,
          password: config.dbPassword,
          database: config.databaseName,
          ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
        }
  );

  return {
    async query(sqlText: string) {
      const result = await pool.query(sqlText);
      return {
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rowCount ?? result.rows.length,
        columns: result.fields.map((field) => field.name),
      };
    },
    async metadata() {
      const tablesResult = await pool.query(
        `
          SELECT
            table_schema,
            table_name,
            column_name,
            data_type,
            is_nullable,
            ordinal_position
          FROM information_schema.columns
          WHERE table_schema = $1
          ORDER BY table_name, ordinal_position
        `,
        [config.databaseSchema]
      );

      const fkResult = await pool.query(
        `
          SELECT
            tc.table_schema,
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS references_table,
            ccu.column_name AS references_column,
            tc.constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = $1
        `,
        [config.databaseSchema]
      );

      const rows = [...tablesResult.rows, ...fkResult.rows];
      const schema = groupRows(rows);
      return {
        databaseType: "postgresql",
        databaseName: config.databaseName,
        capturedAt: new Date().toISOString(),
        summary: {
          tableCount: schema.tables.length,
          columnCount: schema.tables.reduce((count, table) => count + table.columns.length, 0),
          foreignKeyCount: schema.tables.reduce((count, table) => count + (table.foreignKeys?.length || 0), 0),
        },
        schema,
      };
    },
    async close() {
      await pool.end();
    },
  };
}

function createMysqlAdapter(config: AppConfig): DatabaseAdapter {
  const pool = mysql.createPool({
    host: config.mysqlHost,
    port: config.mysqlPort,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
    connectionLimit: 5,
  });

  return {
    async query(sqlText: string) {
      const [rows, fields] = await pool.query(sqlText);
      const normalizedRows = Array.isArray(rows) ? rows.map((row) => row as Record<string, unknown>) : [];
      return {
        rows: normalizedRows,
        rowCount: normalizedRows.length,
        columns: Array.isArray(fields) ? fields.map((field) => field.name) : [],
      };
    },
    async metadata() {
      const [columns] = await pool.query(
        `
          SELECT
            table_schema,
            table_name,
            column_name,
            data_type,
            is_nullable,
            ordinal_position
          FROM information_schema.columns
          WHERE table_schema = DATABASE()
          ORDER BY table_name, ordinal_position
        `
      );

      const [foreignKeys] = await pool.query(
        `
          SELECT
            table_schema,
            table_name,
            column_name,
            referenced_table_name AS references_table,
            referenced_column_name AS references_column,
            constraint_name
          FROM information_schema.key_column_usage
          WHERE table_schema = DATABASE()
            AND referenced_table_name IS NOT NULL
        `
      );

      const schema = groupRows([...(columns as Record<string, unknown>[]), ...(foreignKeys as Record<string, unknown>[])]);
      return {
        databaseType: "mysql",
        databaseName: config.mysqlDatabase,
        capturedAt: new Date().toISOString(),
        summary: {
          tableCount: schema.tables.length,
          columnCount: schema.tables.reduce((count, table) => count + table.columns.length, 0),
          foreignKeyCount: schema.tables.reduce((count, table) => count + (table.foreignKeys?.length || 0), 0),
        },
        schema,
      };
    },
    async close() {
      await pool.end();
    },
  };
}

function createSqlServerAdapter(config: AppConfig): DatabaseAdapter {
  const pool = new sql.ConnectionPool({
    server: config.mssqlServer,
    port: config.mssqlPort,
    user: config.mssqlUser,
    password: config.mssqlPassword,
    database: config.mssqlDatabase,
    options: {
      encrypt: config.mssqlEncrypt,
      trustServerCertificate: !config.mssqlEncrypt,
    },
  });

  const connected = pool.connect();

  return {
    async query(sqlText: string) {
      await connected;
      const result = await pool.request().query(sqlText);
      return {
        rows: result.recordset as Record<string, unknown>[],
        rowCount: result.recordset?.length || 0,
        columns: result.recordset?.length ? Object.keys(result.recordset[0] || {}) : [],
      };
    },
    async metadata() {
      await connected;
      const tablesResult = await pool.request().query(
        `
          SELECT
            s.name AS table_schema,
            t.name AS table_name,
            c.name AS column_name,
            ty.name AS data_type,
            CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS is_nullable,
            c.column_id AS ordinal_position
          FROM sys.tables t
          JOIN sys.schemas s ON s.schema_id = t.schema_id
          JOIN sys.columns c ON c.object_id = t.object_id
          JOIN sys.types ty ON ty.user_type_id = c.user_type_id
          ORDER BY t.name, c.column_id
        `
      );

      const fkResult = await pool.request().query(
        `
          SELECT
            s.name AS table_schema,
            t.name AS table_name,
            c.name AS column_name,
            rt.name AS references_table,
            rc.name AS references_column,
            fk.name AS constraint_name
          FROM sys.foreign_key_columns fkc
          JOIN sys.foreign_keys fk ON fk.object_id = fkc.constraint_object_id
          JOIN sys.tables t ON t.object_id = fkc.parent_object_id
          JOIN sys.schemas s ON s.schema_id = t.schema_id
          JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
          JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
          JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
        `
      );

      const schema = groupRows([...(tablesResult.recordset || []), ...(fkResult.recordset || [])]);
      return {
        databaseType: "sqlserver",
        databaseName: config.mssqlDatabase,
        capturedAt: new Date().toISOString(),
        summary: {
          tableCount: schema.tables.length,
          columnCount: schema.tables.reduce((count, table) => count + table.columns.length, 0),
          foreignKeyCount: schema.tables.reduce((count, table) => count + (table.foreignKeys?.length || 0), 0),
        },
        schema,
      };
    },
    async close() {
      await pool.close();
    },
  };
}

export function createDatabaseAdapter(config: AppConfig) {
  if (config.databaseType === "mysql") {
    return createMysqlAdapter(config);
  }

  if (config.databaseType === "sqlserver") {
    return createSqlServerAdapter(config);
  }

  return createPostgresAdapter(config);
}
