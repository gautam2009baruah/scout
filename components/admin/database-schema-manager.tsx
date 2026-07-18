"use client";

import { FormEvent, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, FileUp, Pencil, Save, Trash2, X } from "lucide-react";
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

type Status = { type: "idle" | "loading"; message: string };
type Toast = { message: string; type: "success" | "error" };
type ConfirmDialog = { message: string; onConfirm: () => void } | null;
type JsonPathSegment = string | number;
type JsonObject = Record<string, unknown>;

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

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isContainerNode(value: unknown): value is JsonObject | unknown[] {
  return Array.isArray(value) || isJsonObject(value);
}

function pathKey(path: JsonPathSegment[]) {
  return path.length === 0 ? "$" : `$/${path.map((segment) => String(segment)).join("/")}`;
}

function deleteNodeAtPath(value: unknown, path: JsonPathSegment[]): unknown {
  if (path.length === 0) return value;
  const [segment, ...rest] = path;

  if (Array.isArray(value)) {
    const index = typeof segment === "number" ? segment : Number(segment);
    if (!Number.isInteger(index) || index < 0 || index >= value.length) return value;
    const nextArray = [...value];
    if (rest.length === 0) {
      nextArray.splice(index, 1);
      return nextArray;
    }
    nextArray[index] = deleteNodeAtPath(nextArray[index], rest);
    return nextArray;
  }

  if (isJsonObject(value)) {
    const key = String(segment);
    if (!(key in value)) return value;
    const nextObject: JsonObject = { ...value };
    if (rest.length === 0) {
      delete nextObject[key];
      return nextObject;
    }
    nextObject[key] = deleteNodeAtPath(nextObject[key], rest);
    return nextObject;
  }

  return value;
}

function collectContainerPaths(value: unknown, path: JsonPathSegment[] = []): string[] {
  if (!isContainerNode(value)) return [];
  const current = [pathKey(path)];

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      current.push(...collectContainerPaths(item, [...path, index]));
    });
    return current;
  }

  Object.entries(value).forEach(([key, child]) => {
    current.push(...collectContainerPaths(child, [...path, key]));
  });
  return current;
}

type JsonNodeProps = {
  label: string;
  value: unknown;
  path: JsonPathSegment[];
  depth: number;
  expanded: Set<string>;
  onToggle: (path: JsonPathSegment[]) => void;
  onDelete: (path: JsonPathSegment[]) => void;
};

function JsonTreeNode({ label, value, path, depth, expanded, onToggle, onDelete }: JsonNodeProps) {
  const key = pathKey(path);
  const container = isContainerNode(value);
  const isExpanded = container ? expanded.has(key) : false;
  const isRoot = path.length === 0;
  const childEntries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : isJsonObject(value)
      ? Object.entries(value)
      : [];

  let displayValue = "";
  if (!container) {
    displayValue = typeof value === "string" ? `\"${value}\"` : String(value);
  }

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50" style={{ marginLeft: `${depth * 14}px` }}>
        {container ? (
          <button
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
            type="button"
            onClick={() => onToggle(path)}
            title={isExpanded ? "Collapse node" : "Expand node"}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block h-5 w-5" />
        )}

        <span className="font-semibold text-slate-800">{label}</span>
        {container ? (
          <span className="text-slate-500">{Array.isArray(value) ? `[${value.length}]` : `{${childEntries.length}}`}</span>
        ) : (
          <span className="truncate text-slate-600">{displayValue}</span>
        )}

        {!isRoot ? (
          <button
            className="ml-auto inline-flex items-center gap-1 rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
            type="button"
            onClick={() => onDelete(path)}
            title="Delete node"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        ) : null}
      </div>

      {container && isExpanded
        ? childEntries.map(([childLabel, childValue]) => (
            <JsonTreeNode
              key={`${key}/${childLabel}`}
              label={childLabel}
              value={childValue}
              path={[...path, Array.isArray(value) ? Number(childLabel) : childLabel]}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))
        : null}
    </div>
  );
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
  const [jsonEditorValue, setJsonEditorValue] = useState<unknown>(null);
  const [jsonEditorExpanded, setJsonEditorExpanded] = useState<Set<string>>(new Set(["$"]));
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const displayRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const byTargetApp = a.targetAppName.localeCompare(b.targetAppName);
        if (byTargetApp !== 0) return byTargetApp;
        return a.databaseName.localeCompare(b.databaseName);
      }),
    [rows]
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
      showToast(parseMessage(body, "Unable to refresh schema list."), "error");
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
      showToast("Target app, database name, and schema file are required.", "error");
      return;
    }

    if (duplicateForTargetApp) {
      showToast("Duplicate database name for selected target app is not allowed.", "error");
      return;
    }

    setStatus({ type: "loading", message: editingSchemaId ? "Saving changes..." : "Uploading and activating schema..." });

    const response = await fetch("/api/admin/database-schemas", {
      method: editingSchemaId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaId: editingSchemaId,
        targetAppId: selectedTargetAppId,
        databaseName: databaseName.trim(),
        databaseType,
        databaseDescription: databaseDescription.trim(),
        schema: undefined,
        schemaText: uploadSchemaText,
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus({ type: "idle", message: "" });
      showToast(parseMessage(body, editingSchemaId ? "Unable to save schema." : "Unable to upload schema."), "error");
      return;
    }

    await refreshRows();
    resetForm();
    setStatus({ type: "idle", message: "" });
    showToast(editingSchemaId ? "Schema updated successfully." : "Schema uploaded and activated successfully.", "success");
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
    setConfirmDialog({
      message: `Delete schema ${row.databaseName} (${row.targetAppName})?`,
      onConfirm: () => {
        void (async () => {
          setConfirmDialog(null);
          setStatus({ type: "loading", message: "Deleting schema..." });

          const response = await fetch("/api/admin/database-schemas", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ schemaId: row.id }),
          });

          const body = await response.json().catch(() => null);
          if (!response.ok) {
            setStatus({ type: "idle", message: "" });
            showToast(parseMessage(body, "Unable to delete schema."), "error");
            return;
          }

          await refreshRows();
          if (editingSchemaId === row.id) {
            resetForm();
          }
          setStatus({ type: "idle", message: "" });
          showToast("Schema deleted.", "success");
        })();
      },
    });
  }

  function openJsonEditor(row: TargetAppDatabaseSchemaRecord) {
    setJsonEditorSchemaId(row.id);
    setJsonEditorValue(cloneSchema(row.schema));
    setJsonEditorExpanded(new Set(collectContainerPaths(row.schema)));
  }

  function toggleJsonNode(path: JsonPathSegment[]) {
    const key = pathKey(path);
    setJsonEditorExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function deleteJsonNode(path: JsonPathSegment[]) {
    setJsonEditorValue((current: unknown) => {
      if (!current) {
        showToast("No JSON loaded in editor.", "error");
        return current;
      }

      const next = deleteNodeAtPath(current, path);
      if (next === current) {
        showToast("Unable to delete selected node.", "error");
        return current;
      }

      showToast("Node removed. Click Save to persist changes.", "success");
      return next;
    });
  }

  function expandAllJsonNodes() {
    setJsonEditorExpanded(new Set(collectContainerPaths(jsonEditorValue)));
  }

  function collapseAllJsonNodes() {
    setJsonEditorExpanded(new Set(["$"]));
  }

  async function saveJsonEditor() {
    if (!jsonEditorSchemaId || !jsonEditorValue) return;

    const row = rows.find((item) => item.id === jsonEditorSchemaId);
    if (!row) return;

    setStatus({ type: "loading", message: "Saving JSON editor changes..." });

    const response = await fetch("/api/admin/database-schemas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaId: row.id,
        databaseName: row.databaseName,
        databaseType: row.databaseType,
        databaseDescription: row.databaseDescription || "",
        schema: jsonEditorValue,
      }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus({ type: "idle", message: "" });
      showToast(parseMessage(body, "Unable to save JSON changes."), "error");
      return;
    }

    await refreshRows();
    setJsonEditorSchemaId(null);
    setJsonEditorValue(null);
    setStatus({ type: "idle", message: "" });
    showToast("Schema JSON updated.", "success");
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
          <div
            className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              className="ml-2 rounded p-0.5 transition-colors hover:bg-black/5"
              type="button"
              onClick={() => setToast(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-950">Please confirm</h3>
            <p className="mt-2 text-sm text-slate-600">{confirmDialog.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                type="button"
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                type="button"
                onClick={confirmDialog.onConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-300 bg-white p-6">
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">Database Schema Setup</h2>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-500">Organization: {companyName}</p>

        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-700">Target App</span>
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              value={selectedTargetAppId}
              onChange={(event) => setSelectedTargetAppId(event.target.value)}
              disabled={Boolean(editingSchemaId)}
            >
              {sortedTargetApps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-700">Database Name</span>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              value={databaseName}
              onChange={(event) => setDatabaseName(event.target.value)}
              placeholder="e.g., ERP_MAIN"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-700">Database Type</span>
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              value={databaseType}
              onChange={(event) => setDatabaseType(event.target.value as SupportedDatabaseType)}
              disabled={Boolean(editingSchemaId)}
            >
              {DATABASE_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-700">Description About This Database</span>
            <textarea
              className="rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              rows={2}
              value={databaseDescription}
              onChange={(event) => setDatabaseDescription(event.target.value)}
              placeholder="Business purpose and scope of this database"
            />
          </label>

          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-700">Upload Schema JSON File</span>
            <input
              className="rounded-md border border-dashed border-blue-400 bg-blue-50/40 px-3 py-3 font-mono text-xs file:mr-3 file:rounded-md file:border-0 file:bg-blue-700 file:px-3 file:py-2 file:text-white"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                void onUploadFileChange(file);
              }}
            />
            {uploadFileName ? <span className="text-xs text-slate-500">Selected: {uploadFileName}</span> : null}
            {editingSchemaId ? (
              <span className="text-xs text-slate-500">Edit mode: target app and database type are locked. Upload JSON is still required.</span>
            ) : null}
          </label>

          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-5 py-2.5 font-mono text-sm font-semibold text-white transition hover:bg-blue-800 focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
              type="submit"
              disabled={status.type === "loading" || duplicateForTargetApp}
            >
              <FileUp className="h-4 w-4" />
              {editingSchemaId ? "Save" : "Upload And Activate"}
            </button>
            {editingSchemaId ? (
              <button
                className="rounded-md border border-slate-300 bg-white px-4 py-2 font-mono text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                type="button"
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-300 bg-white">
        <div className="border-b border-slate-300 px-6 py-4">
          <h3 className="text-xl font-semibold tracking-tight text-slate-950">Uploaded Schema Details</h3>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Sno</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Target App</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Database Name</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Type</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Description</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Version</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Status</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Updated</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={9}>
                    No uploaded schema records are available.
                  </td>
                </tr>
              ) : (
                displayRows.map((row, index) => (
                  <tr className="even:bg-slate-50/70 hover:bg-blue-50/40" key={row.id}>
                    <td className="px-3 py-2 text-slate-700">{index + 1}</td>
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
              <button
                className="text-sm text-slate-600"
                type="button"
                onClick={() => {
                  setJsonEditorSchemaId(null);
                  setJsonEditorValue(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={expandAllJsonNodes}
                >
                  Expand All
                </button>
                <button
                  className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={collapseAllJsonNodes}
                >
                  Collapse All
                </button>
              </div>

              <div className="max-h-[420px] overflow-auto rounded border border-slate-300 bg-white p-2">
                <JsonTreeNode
                  label="root"
                  value={jsonEditorValue}
                  path={[]}
                  depth={0}
                  expanded={jsonEditorExpanded}
                  onToggle={toggleJsonNode}
                  onDelete={deleteJsonNode}
                />
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <button
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  type="button"
                  onClick={() => {
                    setJsonEditorSchemaId(null);
                    setJsonEditorValue(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  type="button"
                  onClick={() => void saveJsonEditor()}
                  disabled={status.type === "loading"}
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
