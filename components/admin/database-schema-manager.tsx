"use client";

import { FormEvent, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Eye, FileUp, HelpCircle, Pencil, RefreshCw, Save, Trash2, X } from "lucide-react";
import type {
  DatabaseSchemaDocument,
  SupportedDatabaseType,
  TargetAppDatabaseSchemaRecord,
} from "@/lib/admin/database-schemas";
import { DatabaseSchemaSyncDialog } from "./database-schema-sync-dialog";

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
  const [syncSchemaRow, setSyncSchemaRow] = useState<TargetAppDatabaseSchemaRecord | null>(null);
  const [downloadHelpOpen, setDownloadHelpOpen] = useState(false);
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

      <section className="relative rounded-lg border border-slate-300 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">Database Schema Setup</h2>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-500">Organization: {companyName}</p>
          </div>
          <a
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            href="/api/admin/database-executor/download"
          >
            <Download className="h-4 w-4" />
            Download Node.js Project
          </a>
          <button
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
            type="button"
            onClick={() => setDownloadHelpOpen((current) => !current)}
            title="Hosting help"
            aria-expanded={downloadHelpOpen}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {downloadHelpOpen ? (
            <div className="absolute right-6 top-16 z-50 max-h-[calc(100vh-6rem)] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">How to host the downloaded project</h3>
                  <p className="mt-1 text-xs text-slate-500">Give this ZIP to the client. They only need to fill in database credentials and start the service.</p>
                </div>
                <button className="rounded p-1 text-slate-500 hover:bg-slate-100" type="button" onClick={() => setDownloadHelpOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-3 text-sm text-slate-700">
                <div>
                  <div className="font-semibold text-slate-900">1. Unzip the project</div>
                  <p className="mt-1 text-xs text-slate-600">The ZIP opens directly to the standalone project. The included README has Windows, Linux/macOS, and Docker instructions.</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">2. Start the setup</div>
                  <p className="mt-1 text-xs text-slate-600">On Windows, double-click <span className="font-mono">start.cmd</span>. On Linux/macOS, run <span className="font-mono">chmod +x start.sh &amp;&amp; ./start.sh</span>. The launcher creates <span className="font-mono">.env</span> automatically.</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">3. Enter the database settings</div>
                  <div className="mt-1 text-xs text-slate-600 space-y-1">
                    <p><span className="font-mono">DB_TYPE</span>: choose <span className="font-mono">postgresql</span>, <span className="font-mono">mysql</span>, or <span className="font-mono">sqlserver</span>.</p>
                    <p><span className="font-mono">DATABASE_URL</span> or the host/port/user/password fields: provide the client database credentials.</p>
                    <p><span className="font-mono">DB_SCHEMA</span>: set the schema name to expose, for example <span className="font-mono">public</span> or <span className="font-mono">dbo</span>.</p>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">4. Start the service</div>
                  <p className="mt-1 text-xs text-slate-600">Run the same launcher again. It installs dependencies automatically the first time and starts the service on port <span className="font-mono">4300</span>.</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Manual commands (without the launcher)</div>
                  <p className="mt-1 text-xs text-slate-600">Open Command Prompt, PowerShell, or a terminal inside the unzipped project folder, then run:</p>
                  <div className="mt-2 rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
                    <div>copy .env.example .env <span className="text-slate-400"># Windows Command Prompt</span></div>
                    <div>Copy-Item .env.example .env <span className="text-slate-400"># PowerShell</span></div>
                    <div>cp .env.example .env <span className="text-slate-400"># Linux/macOS</span></div>
                    <div className="mt-2 text-slate-400"># Edit .env, then:</div>
                    <div>npm ci</div>
                    <div>npm start</div>
                  </div>
                  <p className="mt-2 text-xs text-slate-600"><span className="font-mono">npm ci</span> is needed only for the first installation or after package dependencies change. Use <span className="font-mono">Ctrl+C</span> to stop the foreground service.</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Run with Docker instead</div>
                  <div className="mt-2 rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
                    <div>docker compose up -d --build</div>
                    <div>docker compose ps</div>
                    <div>docker compose logs -f</div>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">Stop it with <span className="font-mono">docker compose down</span>. After changing <span className="font-mono">.env</span>, run <span className="font-mono">docker compose restart</span>.</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">5. Test the service and database</div>
                  <div className="mt-1 space-y-1 text-xs text-slate-600">
                    <p><span className="font-mono">http://CLIENT_SERVER:4300/health</span>: confirms the service is running.</p>
                    <p><span className="font-mono">http://CLIENT_SERVER:4300/ready</span>: confirms the configured database is reachable.</p>
                    <p><span className="font-mono">http://CLIENT_SERVER:4300/v1/database/metadata</span>: returns the schema metadata used by Scout.</p>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Call the SQL execution endpoint</div>
                  <p className="mt-1 text-xs text-slate-600">
                    Send a <span className="font-mono">POST</span> request to <span className="font-mono">http://CLIENT_SERVER:4300/v1/sql/execute</span> with
                    header <span className="font-mono">Content-Type: application/json</span>. The JSON body requires one string property named <span className="font-mono">sql</span>. Do not add a trailing slash to the URL.
                  </p>
                  <div className="mt-2 rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
                    <div className="text-slate-400"># Request body</div>
                    <div>{`{"sql":"SELECT * FROM users LIMIT 10"}`}</div>
                    <div className="mt-2 text-slate-400"># cURL</div>
                    <div>curl -X POST http://localhost:4300/v1/sql/execute \</div>
                    <div className="pl-4">-H &quot;Content-Type: application/json&quot; \</div>
                    <div className="pl-4">-d &apos;{`{"sql":"SELECT * FROM users LIMIT 10"}`}&apos;</div>
                    <div className="mt-2 text-slate-400"># PowerShell</div>
                    <div>$body = {`@{ sql = "SELECT * FROM users LIMIT 10" } | ConvertTo-Json`}</div>
                    <div>Invoke-RestMethod -Method Post `</div>
                    <div className="pl-4">-Uri http://localhost:4300/v1/sql/execute `</div>
                    <div className="pl-4">-ContentType &quot;application/json&quot; -Body $body</div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p>The response includes <span className="font-mono">ok</span>, <span className="font-mono">databaseType</span>, <span className="font-mono">databaseName</span>, <span className="font-mono">durationMs</span>, <span className="font-mono">rowCount</span>, <span className="font-mono">columns</span>, and <span className="font-mono">rows</span>.</p>
                    <p>An empty or missing <span className="font-mono">sql</span> value returns HTTP <span className="font-mono">400</span>. Database execution errors also return HTTP <span className="font-mono">400</span> with a <span className="font-mono">message</span>.</p>
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="font-semibold text-amber-950">Important hosting notes</div>
                  <div className="mt-1 space-y-1 text-xs text-amber-900">
                    <p>Install Node.js 20.6 or newer when not using Docker.</p>
                    <p>Restart the service after every <span className="font-mono">.env</span> change.</p>
                    <p>Allow port <span className="font-mono">4300</span> only between Scout and authorized client systems.</p>
                    <p>The SQL endpoint executes the supplied statement using the configured database account. Give that account only the permissions required by Scout workflows.</p>
                    <p>When Docker connects to a database on the same Windows/macOS computer, use <span className="font-mono">host.docker.internal</span> instead of <span className="font-mono">localhost</span>.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

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
                          className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700"
                          type="button"
                          onClick={() => setSyncSchemaRow(row)}
                          title="Sync schema"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Sync
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

      {syncSchemaRow ? (
        <DatabaseSchemaSyncDialog
          schema={syncSchemaRow}
          onClose={() => setSyncSchemaRow(null)}
          onSynced={async () => {
            await refreshRows();
            setSyncSchemaRow(null);
          }}
        />
      ) : null}
    </div>
  );
}
