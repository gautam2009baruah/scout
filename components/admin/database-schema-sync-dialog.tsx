"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import type { DatabaseSchemaDocument, TargetAppDatabaseSchemaRecord } from "@/lib/admin/database-schemas";

type SyncConfig = {
  endpointUrl: string;
  method: "GET" | "POST";
  headersJson: string;
  bodyJson: string;
  responseSchemaPath: string;
};

type SyncResponse = {
  changed: boolean;
  synced?: boolean;
  message?: string;
  comparison?: {
    addedTables: string[];
    removedTables: string[];
    changedTables: Array<{ name: string; addedColumns: string[]; removedColumns: string[]; foreignKeysChanged: boolean }>;
  };
  currentSchema?: DatabaseSchemaDocument;
  latestSchema?: DatabaseSchemaDocument;
  schema?: TargetAppDatabaseSchemaRecord;
};

type Props = {
  schema: TargetAppDatabaseSchemaRecord;
  onClose: () => void;
  onSynced: () => Promise<void> | void;
};

const STORAGE_KEY = "scout.database-schema-sync-config";

const DEFAULT_CONFIG: SyncConfig = {
  endpointUrl: "",
  method: "GET",
  headersJson: "{}",
  bodyJson: "{}",
  responseSchemaPath: "schema",
};

function loadConfig(): SyncConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_CONFIG;
    const parsed = JSON.parse(stored) as Partial<SyncConfig>;
    return {
      endpointUrl: String(parsed.endpointUrl || ""),
      method: parsed.method === "POST" ? "POST" : "GET",
      headersJson: String(parsed.headersJson || "{}"),
      bodyJson: String(parsed.bodyJson || "{}"),
      responseSchemaPath: String(parsed.responseSchemaPath || "schema"),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function DatabaseSchemaSyncDialog({ schema, onClose, onSynced }: Props) {
  const [config, setConfig] = useState<SyncConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config, hydrated]);

  async function runSync(apply: boolean) {
    if (!config.endpointUrl.trim()) {
      setError("API endpoint URL is required.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/admin/database-schemas/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaId: schema.id,
          apply,
          apiConfig: config,
        }),
      });

      const body = (await response.json().catch(() => null)) as SyncResponse | null;
      if (!response.ok) {
        throw new Error(body?.message || "Unable to sync schema.");
      }

      setResult(body);
      if (body?.synced) {
        await onSynced();
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to sync schema.");
    } finally {
      setLoading(false);
    }
  }

  const hasChanges = Boolean(result?.changed && !result?.synced);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Sync Schema</h3>
            <p className="text-xs text-slate-500">Compare the saved schema with the client&apos;s latest metadata API response.</p>
          </div>
          <button className="rounded p-1 text-slate-500 hover:bg-slate-100" type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">Saved schema</div>
              <div className="mt-1">{schema.targetAppName} / {schema.databaseName} / v{schema.version}</div>
              <div className="mt-1 text-xs text-slate-500">{schema.databaseType} • {schema.schema.tables.length} tables</div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-700">API Endpoint URL</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={config.endpointUrl}
                  onChange={(event) => setConfig((current) => ({ ...current, endpointUrl: event.target.value }))}
                  placeholder="https://client-host.example.com/v1/database/metadata"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-700">HTTP Method</span>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={config.method}
                  onChange={(event) => setConfig((current) => ({ ...current, method: event.target.value as SyncConfig["method"] }))}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-slate-700">Response Schema Path</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.responseSchemaPath}
                onChange={(event) => setConfig((current) => ({ ...current, responseSchemaPath: event.target.value }))}
                placeholder="schema"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-slate-700">Headers JSON</span>
              <textarea
                className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                value={config.headersJson}
                onChange={(event) => setConfig((current) => ({ ...current, headersJson: event.target.value }))}
                placeholder='{"Authorization":"Bearer ..."}'
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-slate-700">Request Body JSON</span>
              <textarea
                className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                value={config.bodyJson}
                onChange={(event) => setConfig((current) => ({ ...current, bodyJson: event.target.value }))}
                placeholder='{"schemaName":"main"}'
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                type="button"
                onClick={() => void runSync(false)}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Check Latest
              </button>

              <button
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                type="button"
                onClick={() => void runSync(true)}
                disabled={loading || !hasChanges}
              >
                Sync Latest
              </button>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {result?.message ? <p className={`text-sm ${result.synced ? "text-emerald-700" : "text-slate-700"}`}>{result.message}</p> : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Comparison summary</div>
              <div className="mt-2 text-sm text-slate-700">
                {result ? (
                  <>
                    <div>Added tables: {result.comparison?.addedTables.length || 0}</div>
                    <div>Removed tables: {result.comparison?.removedTables.length || 0}</div>
                    <div>Changed tables: {result.comparison?.changedTables.length || 0}</div>
                  </>
                ) : (
                  <div>Run Check Latest to compare the saved schema with the client&apos;s remote metadata.</div>
                )}
              </div>
            </div>

            {result?.comparison ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                <div>
                  <div className="font-semibold text-slate-900">Added tables</div>
                  <div>{result.comparison.addedTables.length ? result.comparison.addedTables.join(", ") : "None"}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Removed tables</div>
                  <div>{result.comparison.removedTables.length ? result.comparison.removedTables.join(", ") : "None"}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Changed tables</div>
                  <div>{result.comparison.changedTables.length ? result.comparison.changedTables.map((table) => table.name).join(", ") : "None"}</div>
                </div>
              </div>
            ) : null}

            {result?.latestSchema ? (
              <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">Remote schema preview</div>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-100">
                  {JSON.stringify(result.latestSchema, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
