"use client";

import { FormEvent, useMemo, useState } from "react";
import { Database, FileUp, Save, Trash2, RefreshCw, Shield, History } from "lucide-react";
import type {
  DatabaseSchemaDocument,
  SupportedDatabaseType,
  TargetAppDatabaseSchemaRecord,
  DatabaseSchemaCatalogEntry,
} from "@/lib/admin/database-schemas";

type TargetAppOption = {
  id: string;
  name: string;
  companyId: string;
};

type Props = {
  companyName: string;
  targetApps: TargetAppOption[];
  catalog: DatabaseSchemaCatalogEntry[];
};

type Status = { type: "idle" | "loading" | "success" | "error"; message: string };

const DATABASE_TYPES: Array<{ value: SupportedDatabaseType; label: string }> = [
  { value: "sqlserver", label: "SQL Server" },
  { value: "oracle", label: "Oracle" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "sqlite", label: "SQLite" },
  { value: "other", label: "Other" },
];

function cloneSchema(schema: DatabaseSchemaDocument): DatabaseSchemaDocument {
  return {
    tables: schema.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => ({ ...column })),
      foreignKeys: (table.foreignKeys || []).map((fk) => ({ ...fk })),
    })),
  };
}

function parseMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = String((payload as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

export function DatabaseSchemaManager({ companyName, targetApps, catalog }: Props) {
  const sortedTargetApps = useMemo(() => [...targetApps].sort((a, b) => a.name.localeCompare(b.name)), [targetApps]);
  const [selectedTargetAppId, setSelectedTargetAppId] = useState(sortedTargetApps[0]?.id ?? "");
  const [databaseName, setDatabaseName] = useState("");
  const [databaseType, setDatabaseType] = useState<SupportedDatabaseType>("sqlserver");
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadSchemaText, setUploadSchemaText] = useState("");
  const [activeSchema, setActiveSchema] = useState<TargetAppDatabaseSchemaRecord | null>(null);
  const [editableSchema, setEditableSchema] = useState<DatabaseSchemaDocument | null>(null);
  const [history, setHistory] = useState<TargetAppDatabaseSchemaRecord[]>([]);
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });

  const targetAppCatalog = useMemo(
    () => catalog.filter((item) => item.targetAppId === selectedTargetAppId).sort((a, b) => a.databaseName.localeCompare(b.databaseName)),
    [catalog, selectedTargetAppId]
  );

  const selectedCatalog = useMemo(
    () => targetAppCatalog.find((item) => item.databaseName.toLowerCase() === databaseName.trim().toLowerCase()) || null,
    [targetAppCatalog, databaseName]
  );

  async function loadActiveSchema(targetAppId: string, dbName: string) {
    if (!targetAppId || !dbName.trim()) {
      setStatus({ type: "error", message: "Select a target app and database name first." });
      return;
    }

    setStatus({ type: "loading", message: "Loading active schema..." });

    const response = await fetch(
      `/api/admin/database-schemas?targetAppId=${encodeURIComponent(targetAppId)}&databaseName=${encodeURIComponent(dbName.trim())}`,
      { method: "GET" }
    );
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus({ type: "error", message: parseMessage(body, "Unable to load schema details.") });
      return;
    }

    const nextActive = (body?.active as TargetAppDatabaseSchemaRecord | null) || null;
    const nextHistory = Array.isArray(body?.history) ? (body.history as TargetAppDatabaseSchemaRecord[]) : [];

    setActiveSchema(nextActive);
    setEditableSchema(nextActive ? cloneSchema(nextActive.schema) : null);
    setHistory(nextHistory);

    if (nextActive) {
      setDatabaseType(nextActive.databaseType);
      setStatus({ type: "success", message: `Loaded active schema v${nextActive.version}.` });
    } else {
      setStatus({ type: "success", message: "No active schema yet for this database. Upload one to start." });
    }
  }

  async function uploadSchema(event: FormEvent) {
    event.preventDefault();

    if (!selectedTargetAppId || !databaseName.trim() || !uploadSchemaText.trim()) {
      setStatus({ type: "error", message: "Target app, database name, and schema file are required." });
      return;
    }

    setStatus({ type: "loading", message: "Uploading new schema version..." });

    const response = await fetch("/api/admin/database-schemas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetAppId: selectedTargetAppId,
        databaseName: databaseName.trim(),
        databaseType,
        schemaText: uploadSchemaText,
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus({ type: "error", message: parseMessage(body, "Unable to upload schema.") });
      return;
    }

    setUploadSchemaText("");
    setUploadFileName("");
    await loadActiveSchema(selectedTargetAppId, databaseName);
    setStatus({ type: "success", message: "Schema uploaded. Previous active version is now inactive." });
  }

  async function saveConfiguration() {
    if (!selectedTargetAppId || !databaseName.trim() || !editableSchema) {
      setStatus({ type: "error", message: "Load an active schema before saving changes." });
      return;
    }

    setStatus({ type: "loading", message: "Saving schema configuration..." });

    const response = await fetch("/api/admin/database-schemas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetAppId: selectedTargetAppId,
        databaseName: databaseName.trim(),
        databaseType,
        schema: editableSchema,
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus({ type: "error", message: parseMessage(body, "Unable to save schema configuration.") });
      return;
    }

    await loadActiveSchema(selectedTargetAppId, databaseName);
    setStatus({ type: "success", message: "Schema configuration saved." });
  }

  async function onUploadFileChange(file: File | null) {
    if (!file) return;
    setUploadFileName(file.name);
    const text = await file.text();
    setUploadSchemaText(text);
  }

  function updateTableDescription(tableName: string, description: string) {
    if (!editableSchema) return;
    setEditableSchema({
      tables: editableSchema.tables.map((table) =>
        table.name === tableName ? { ...table, description } : table
      ),
    });
  }

  function updateTableExposure(tableName: string, isExposed: boolean) {
    if (!editableSchema) return;
    setEditableSchema({
      tables: editableSchema.tables.map((table) =>
        table.name === tableName ? { ...table, isExposed } : table
      ),
    });
  }

  function updateColumnDescription(tableName: string, columnName: string, description: string) {
    if (!editableSchema) return;
    setEditableSchema({
      tables: editableSchema.tables.map((table) =>
        table.name === tableName
          ? {
              ...table,
              columns: table.columns.map((column) =>
                column.name === columnName ? { ...column, description } : column
              ),
            }
          : table
      ),
    });
  }

  function updateColumnExposure(tableName: string, columnName: string, isExposed: boolean) {
    if (!editableSchema) return;
    setEditableSchema({
      tables: editableSchema.tables.map((table) =>
        table.name === tableName
          ? {
              ...table,
              columns: table.columns.map((column) =>
                column.name === columnName ? { ...column, isExposed } : column
              ),
            }
          : table
      ),
    });
  }

  function deleteTable(tableName: string) {
    if (!editableSchema) return;
    if (!window.confirm(`Delete table ${tableName}?`)) return;

    setEditableSchema({
      tables: editableSchema.tables.filter((table) => table.name !== tableName),
    });
  }

  function deleteColumn(tableName: string, columnName: string) {
    if (!editableSchema) return;
    if (!window.confirm(`Delete column ${tableName}.${columnName}?`)) return;

    setEditableSchema({
      tables: editableSchema.tables.map((table) =>
        table.name === tableName
          ? { ...table, columns: table.columns.filter((column) => column.name !== columnName) }
          : table
      ),
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="grid gap-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Database className="h-4 w-4" />
            Database Schema Manager
          </div>
          <p className="mt-2 text-xs text-slate-500">Organization: {companyName}</p>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Target App</span>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={selectedTargetAppId}
                onChange={(event) => {
                  setSelectedTargetAppId(event.target.value);
                  setDatabaseName("");
                  setActiveSchema(null);
                  setEditableSchema(null);
                  setHistory([]);
                }}
              >
                {sortedTargetApps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Database</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="e.g., ERP_MAIN"
                value={databaseName}
                onChange={(event) => setDatabaseName(event.target.value)}
              />
            </label>

            {targetAppCatalog.length > 0 ? (
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Existing Databases</span>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={selectedCatalog?.databaseName || ""}
                  onChange={(event) => {
                    const selected = targetAppCatalog.find((item) => item.databaseName === event.target.value);
                    if (!selected) return;
                    setDatabaseName(selected.databaseName);
                    setDatabaseType(selected.databaseType);
                    void loadActiveSchema(selected.targetAppId, selected.databaseName);
                  }}
                >
                  <option value="">Select existing database...</option>
                  {targetAppCatalog.map((item) => (
                    <option key={`${item.targetAppId}-${item.databaseName}`} value={item.databaseName}>
                      {item.databaseName} (v{item.activeVersion})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Database Type</span>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={databaseType}
                onChange={(event) => setDatabaseType(event.target.value as SupportedDatabaseType)}
              >
                {DATABASE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void loadActiveSchema(selectedTargetAppId, databaseName)}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              Load Active Schema
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <form className="grid gap-3" onSubmit={uploadSchema}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <FileUp className="h-4 w-4" />
              Upload New Schema Version
            </div>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Schema JSON File</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void onUploadFileChange(file);
                }}
              />
            </label>
            {uploadFileName ? <p className="text-xs text-slate-500">Selected: {uploadFileName}</p> : null}
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={status.type === "loading"}
              type="submit"
            >
              <FileUp className="h-4 w-4" />
              Upload And Activate
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <History className="h-4 w-4" />
            Version History (Audit)
          </div>
          <div className="mt-3 max-h-64 overflow-auto space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">No history loaded.</p>
            ) : (
              history.map((entry) => (
                <div key={entry.id} className="rounded border border-slate-200 px-3 py-2 text-xs">
                  <p className="font-semibold text-slate-700">v{entry.version} {entry.isActive ? "(Active)" : "(Inactive)"}</p>
                  <p className="text-slate-500">Updated: {new Date(entry.updatedAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </aside>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Active Schema Tree</h2>
              <p className="text-sm text-slate-500">
                {activeSchema
                  ? `${activeSchema.targetAppName} • ${activeSchema.databaseName} • v${activeSchema.version}`
                  : "Load or upload a schema to begin configuration."}
              </p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void saveConfiguration()}
              disabled={!editableSchema || status.type === "loading"}
              type="button"
            >
              <Save className="h-4 w-4" />
              Save Configuration
            </button>
          </div>

          {status.message ? (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                status.type === "error"
                  ? "bg-red-50 text-red-700"
                  : status.type === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {status.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 p-5">
          {!editableSchema ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              No active schema loaded.
            </div>
          ) : (
            <div className="space-y-3">
              {editableSchema.tables.map((table) => (
                <details key={table.name} className="rounded-lg border border-slate-200 bg-white" open>
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">{table.name}</p>
                      <p className="text-xs text-slate-500">{table.columns.length} columns</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <Shield className="h-3.5 w-3.5" />
                        <input
                          type="checkbox"
                          checked={table.isExposed !== false}
                          onChange={(event) => updateTableExposure(table.name, event.target.checked)}
                        />
                        Expose table
                      </label>
                      <button
                        className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        type="button"
                        onClick={() => deleteTable(table.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </summary>

                  <div className="grid gap-3 border-t border-slate-200 px-4 py-3">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Table Description</span>
                      <input
                        className="rounded border border-slate-300 px-3 py-2"
                        value={table.description || ""}
                        onChange={(event) => updateTableDescription(table.name, event.target.value)}
                        placeholder="Business description for this table"
                      />
                    </label>

                    <div className="rounded-md border border-slate-200">
                      <div className="grid grid-cols-[1.4fr_1fr_1fr_120px_100px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                        <span>Column</span>
                        <span>Type</span>
                        <span>Description</span>
                        <span>Expose</span>
                        <span>Delete</span>
                      </div>
                      {table.columns.map((column) => (
                        <div
                          key={`${table.name}-${column.name}`}
                          className="grid grid-cols-[1.4fr_1fr_1fr_120px_100px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
                        >
                          <span className="font-medium text-slate-800">{column.name}</span>
                          <span className="text-slate-600">{column.type || "-"}</span>
                          <input
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                            value={column.description || ""}
                            onChange={(event) =>
                              updateColumnDescription(table.name, column.name, event.target.value)
                            }
                            placeholder="Description"
                          />
                          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={column.isExposed !== false}
                              onChange={(event) =>
                                updateColumnExposure(table.name, column.name, event.target.checked)
                              }
                            />
                            Expose
                          </label>
                          <button
                            className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            type="button"
                            onClick={() => deleteColumn(table.name, column.name)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>

                    {(table.foreignKeys || []).length > 0 ? (
                      <details className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                        <summary className="cursor-pointer font-semibold text-slate-700">
                          Foreign Keys ({table.foreignKeys?.length || 0})
                        </summary>
                        <div className="mt-2 space-y-1">
                          {(table.foreignKeys || []).map((fk, index) => (
                            <p key={`${table.name}-fk-${index}`}>
                              {fk.name || `${table.name}_${fk.column}_fk`}: {table.name}.{fk.column} → {fk.referencesTable}.{fk.referencesColumn}
                            </p>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          )}

          <details className="rounded-lg border border-slate-200 bg-slate-50 p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Schema Extraction Help (No Data)</summary>
            <div className="mt-3 space-y-3 text-xs text-slate-700">
              <details className="rounded border border-slate-200 bg-white p-3" open>
                <summary className="cursor-pointer font-semibold">SQL Server</summary>
                <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-slate-100">{`SELECT
  t.TABLE_NAME AS [name],
  (
    SELECT
      c.COLUMN_NAME AS [name],
      c.DATA_TYPE AS [type],
      CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS [nullable]
    FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE c.TABLE_NAME = t.TABLE_NAME
    FOR JSON PATH
  ) AS [columns]
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE='BASE TABLE'
FOR JSON PATH, ROOT('tables');`}</pre>
              </details>

              <details className="rounded border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer font-semibold">Oracle</summary>
                <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-slate-100">{`SELECT JSON_OBJECT(
  'tables' VALUE JSON_ARRAYAGG(
    JSON_OBJECT(
      'name' VALUE t.table_name,
      'columns' VALUE (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'name' VALUE c.column_name,
            'type' VALUE c.data_type,
            'nullable' VALUE CASE WHEN c.nullable='Y' THEN 1 ELSE 0 END
          )
        )
        FROM user_tab_columns c
        WHERE c.table_name = t.table_name
      )
    )
  )
) AS schema_json
FROM user_tables t;`}</pre>
              </details>

              <details className="rounded border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer font-semibold">PostgreSQL</summary>
                <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-slate-100">{`SELECT json_build_object(
  'tables', json_agg(
    json_build_object(
      'name', table_name,
      'columns', (
        SELECT json_agg(json_build_object(
          'name', column_name,
          'type', data_type,
          'nullable', (is_nullable = 'YES')
        ))
        FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=t.table_name
      )
    )
  )
)
FROM information_schema.tables t
WHERE table_schema='public' AND table_type='BASE TABLE';`}</pre>
              </details>

              <details className="rounded border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer font-semibold">MySQL</summary>
                <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-slate-100">{`SELECT JSON_OBJECT(
  'tables', JSON_ARRAYAGG(
    JSON_OBJECT(
      'name', t.table_name,
      'columns', (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'name', c.column_name,
            'type', c.data_type,
            'nullable', c.is_nullable = 'YES'
          )
        )
        FROM information_schema.columns c
        WHERE c.table_schema = DATABASE() AND c.table_name = t.table_name
      )
    )
  )
) AS schema_json
FROM information_schema.tables t
WHERE t.table_schema = DATABASE() AND t.table_type='BASE TABLE';`}</pre>
              </details>

              <details className="rounded border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer font-semibold">SQLite</summary>
                <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-slate-100">{`-- Use sqlite3 shell
.headers off
.mode json
SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';
-- For each table:
PRAGMA table_info('your_table_name');`}</pre>
              </details>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
