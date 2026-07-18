"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, FileUp, Pencil, Save, Trash2 } from "lucide-react";
import type {
  DatabaseSchemaDocument,
  SupportedDatabaseType,
  TargetAppDatabaseSchemaRecord,
} from "@/lib/admin/database-schemas";

type TargetAppOption = {
  id: string;
  name: string;
  companyId: string;
};

type Props = {
  companyName: string;
  targetApps: TargetAppOption[];
  schemas: TargetAppDatabaseSchemaRecord[];
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

function parseMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = String((payload as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

function cloneSchema(schema: DatabaseSchemaDocument): DatabaseSchemaDocument {
  return {
    tables: schema.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => ({ ...column })),
      foreignKeys: (table.foreignKeys || []).map((fk) => ({ ...fk })),
    })),
  };
}

export function DatabaseSchemaManager({ companyName, targetApps, schemas }: Props) {
  const sortedTargetApps = useMemo(() => [...targetApps].sort((a, b) => a.name.localeCompare(b.name)), [targetApps]);
  const [rows, setRows] = useState<TargetAppDatabaseSchemaRecord[]>(schemas);
  const [selectedTargetAppId, setSelectedTargetAppId] = useState(sortedTargetApps[0]?.id ?? "");
  const [databaseName, setDatabaseName] = useState("");
  const [databaseType, setDatabaseType] = useState<SupportedDatabaseType>("sqlserver");
  const [databaseDescription, setDatabaseDescription] = useState("");
  const [uploadSchemaText, setUploadSchemaText] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [editingSchemaId, setEditingSchemaId] = useState<string | null>(null);
  const [editableSchema, setEditableSchema] = useState<DatabaseSchemaDocument | null>(null);
  const [jsonEditorSchemaId, setJsonEditorSchemaId] = useState<string | null>(null);
  const [jsonEditorText, setJsonEditorText] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });

  const filteredRows = useMemo(
    () => rows.filter((row) => (selectedTargetAppId ? row.targetAppId === selectedTargetAppId : true)),
    [rows, selectedTargetAppId]
  );

  const duplicateForTargetApp = useMemo(() => {
    const normalizedName = databaseName.trim().toLowerCase();
    if (!selectedTargetAppId || !normalizedName || editingSchemaId) return false;
    return rows.some(
      (row) => row.targetAppId === selectedTargetAppId && row.databaseName.trim().toLowerCase() === normalizedName
    );
  }, [databaseName, editingSchemaId, rows, selectedTargetAppId]);

  async function refreshRows() {
    const response = await fetch("/api/admin/database-schemas", { method: "GET" });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus({ type: "error", message: parseMessage(body, "Unable to refresh schema list.") });
      return;
    }

    const nextRows = Array.isArray(body?.schemas) ? (body.schemas as TargetAppDatabaseSchemaRecord[]) : [];
    setRows(nextRows);
  }

  function resetForm() {
    setDatabaseName("");
    setDatabaseType("sqlserver");
    setDatabaseDescription("");
    setUploadSchemaText("");
    setUploadFileName("");
    setEditingSchemaId(null);
    setEditableSchema(null);
  }

  async function onUploadFileChange(file: File | null) {
    if (!file) return;
    setUploadFileName(file.name);
    const text = await file.text();
    setUploadSchemaText(text);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!selectedTargetAppId || !databaseName.trim() || !uploadSchemaText.trim()) {
      setStatus({ type: "error", message: "Target app, database name, and schema file are required." });
      return;
    }

    if (duplicateForTargetApp) {
      setStatus({ type: "error", message: "Duplicate database name for selected target app is not allowed." });
      return;
    }

    setStatus({ type: "loading", message: editingSchemaId ? "Saving changes..." : "Uploading and activating schema..." });

    let schemaPayload: unknown = undefined;
    if (editableSchema) {
      schemaPayload = editableSchema;
    }

    const response = await fetch("/api/admin/database-schemas", {
      method: editingSchemaId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaId: editingSchemaId,
        targetAppId: selectedTargetAppId,
        databaseName: databaseName.trim(),
        databaseType,
        databaseDescription: databaseDescription.trim(),
        schema: schemaPayload,
        schemaText: schemaPayload ? undefined : uploadSchemaText,
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus({ type: "error", message: parseMessage(body, editingSchemaId ? "Unable to save schema." : "Unable to upload schema.") });
      return;
    }

    await refreshRows();
    resetForm();
    setStatus({ type: "success", message: editingSchemaId ? "Schema updated successfully." : "Schema uploaded and activated successfully." });
  }

  function startEdit(row: TargetAppDatabaseSchemaRecord) {
    setSelectedTargetAppId(row.targetAppId);
    setDatabaseName(row.databaseName);
    setDatabaseType(row.databaseType);
    setDatabaseDescription(row.databaseDescription || "");
    setEditableSchema(cloneSchema(row.schema));
    setEditingSchemaId(row.id);
    setUploadSchemaText("");
    setUploadFileName("");
    setStatus({ type: "idle", message: "" });
  }

  async function deleteRow(row: TargetAppDatabaseSchemaRecord) {
    if (!window.confirm(`Delete schema ${row.databaseName} (${row.targetAppName})?`)) {
      return;
    }

    setStatus({ type: "loading", message: "Deleting schema..." });

    const response = await fetch("/api/admin/database-schemas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaId: row.id }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus({ type: "error", message: parseMessage(body, "Unable to delete schema.") });
      return;
    }

    await refreshRows();
    if (editingSchemaId === row.id) {
      resetForm();
    }
    setStatus({ type: "success", message: "Schema deleted." });
  }

  function openJsonEditor(row: TargetAppDatabaseSchemaRecord) {
    setJsonEditorSchemaId(row.id);
    setJsonEditorText(JSON.stringify(row.schema, null, 2));
  }

  async function saveJsonEditor() {
    if (!jsonEditorSchemaId) return;

    const row = rows.find((item) => item.id === jsonEditorSchemaId);
    if (!row) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonEditorText);
    } catch {
      setStatus({ type: "error", message: "Invalid JSON in editor." });
      return;
    }

    setStatus({ type: "loading", message: "Saving JSON editor changes..." });

    const response = await fetch("/api/admin/database-schemas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaId: row.id,
        databaseName: row.databaseName,
        databaseType: row.databaseType,
        databaseDescription: row.databaseDescription || "",
        schema: parsed,
      }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus({ type: "error", message: parseMessage(body, "Unable to save JSON changes.") });
      return;
    }

    await refreshRows();
    setJsonEditorSchemaId(null);
    setJsonEditorText("");
    setStatus({ type: "success", message: "Schema JSON updated." });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-950">Database Schema Setup</h2>
        <p className="mt-1 text-xs text-slate-500">Organization: {companyName}</p>

        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Target App</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={selectedTargetAppId}
              onChange={(event) => setSelectedTargetAppId(event.target.value)}
            >
              {sortedTargetApps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Database Name</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={databaseName}
              onChange={(event) => setDatabaseName(event.target.value)}
              placeholder="e.g., ERP_MAIN"
            />
          </label>

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

          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Description About This Database</span>
            <textarea
              className="rounded-lg border border-slate-300 px-3 py-2"
              rows={2}
              value={databaseDescription}
              onChange={(event) => setDatabaseDescription(event.target.value)}
              placeholder="Business purpose and scope of this database"
            />
          </label>

          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Upload Schema JSON File</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                void onUploadFileChange(file);
              }}
            />
            {uploadFileName ? <span className="text-xs text-slate-500">Selected: {uploadFileName}</span> : null}
          </label>

          {duplicateForTargetApp ? (
            <div className="md:col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Duplicate database name found for this target app. Use Edit in the list below.
            </div>
          ) : null}

          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              type="submit"
              disabled={status.type === "loading" || duplicateForTargetApp}
            >
              <FileUp className="h-4 w-4" />
              {editingSchemaId ? "Save" : "Upload And Activate"}
            </button>
            {editingSchemaId ? (
              <button
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                type="button"
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-950">Uploaded Schema Details</h3>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Target App</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Database Name</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Version</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Updated</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={8}>
                    No uploaded schema records for selected target app.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-slate-700">{row.targetAppName}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.databaseName}</td>
                    <td className="px-3 py-2 text-slate-700">{row.databaseType}</td>
                    <td className="px-3 py-2 text-slate-600">{row.databaseDescription || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">v{row.version}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{new Date(row.updatedAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                          type="button"
                          onClick={() => startEdit(row)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                          type="button"
                          onClick={() => openJsonEditor(row)}
                          title="View in JSON editor"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          JSON
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                          type="button"
                          onClick={() => void deleteRow(row)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {status.message ? (
          <p className={`rounded-lg px-3 py-2 text-sm ${status.type === "error" ? "bg-red-50 text-red-700" : status.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
            {status.message}
          </p>
        ) : null}
      </section>

      <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Schema Extraction Help (No Data)</summary>
        <div className="mt-3 space-y-3 text-xs text-slate-700">
          <details className="rounded border border-slate-200 bg-white p-3">
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

      {jsonEditorSchemaId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h4 className="text-sm font-semibold text-slate-900">Schema JSON Editor</h4>
              <button className="text-sm text-slate-600" type="button" onClick={() => setJsonEditorSchemaId(null)}>
                Close
              </button>
            </div>
            <div className="p-4">
              <textarea
                className="h-[420px] w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                value={jsonEditorText}
                onChange={(event) => setJsonEditorText(event.target.value)}
              />
              <div className="mt-3 flex justify-end">
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  type="button"
                  onClick={() => void saveJsonEditor()}
                >
                  <Save className="h-4 w-4" />
                  Save JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
