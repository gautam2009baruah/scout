"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, X } from "lucide-react";
import type { DatabaseSchemaDocument, TargetAppDatabaseSchemaRecord } from "@/lib/admin/database-schemas";

type SyncConfig = {
  endpointUrl: string;
  method: "GET" | "POST";
  bodyJson: string;
  responseSchemaPath: string;
  authMode: "none" | "bearer" | "apiKey" | "basic";
  authHeaderName: string;
  authToken: string;
  authUsername: string;
  authPassword: string;
  customHeadersJson: string;
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
  bodyJson: "{}",
  responseSchemaPath: "schema",
  authMode: "none",
  authHeaderName: "Authorization",
  authToken: "",
  authUsername: "",
  authPassword: "",
  customHeadersJson: "{}",
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
      bodyJson: String(parsed.bodyJson || "{}"),
      responseSchemaPath: String(parsed.responseSchemaPath || "schema"),
      authMode: parsed.authMode === "bearer" || parsed.authMode === "apiKey" || parsed.authMode === "basic" ? parsed.authMode : "none",
      authHeaderName: String(parsed.authHeaderName || "Authorization"),
      authToken: String(parsed.authToken || ""),
      authUsername: String(parsed.authUsername || ""),
      authPassword: String(parsed.authPassword || ""),
      customHeadersJson: String(parsed.customHeadersJson || "{}"),
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
  const [helpOpen, setHelpOpen] = useState(true);

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

    const headers: Record<string, string> = {};

    try {
      if (config.customHeadersJson.trim()) {
        Object.assign(headers, JSON.parse(config.customHeadersJson));
      }
    } catch {
      setError("Custom headers JSON must be valid JSON.");
      return;
    }

    if (config.authMode === "bearer") {
      if (!config.authToken.trim()) {
        setError("Bearer token is required.");
        return;
      }
      headers[config.authHeaderName.trim() || "Authorization"] = `Bearer ${config.authToken.trim()}`;
    }

    if (config.authMode === "apiKey") {
      if (!config.authToken.trim()) {
        setError("API key value is required.");
        return;
      }
      headers[config.authHeaderName.trim() || "X-API-Key"] = config.authToken.trim();
    }

    if (config.authMode === "basic") {
      if (!config.authUsername.trim() || !config.authPassword.trim()) {
        setError("Basic auth requires username and password.");
        return;
      }
      headers.Authorization = `Basic ${btoa(`${config.authUsername.trim()}:${config.authPassword.trim()}`)}`;
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
          headers,
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

            <details className="rounded-lg border border-slate-200 bg-white p-4" open={helpOpen} onToggle={(event) => setHelpOpen((event.currentTarget as HTMLDetailsElement).open)}>
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
                {helpOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Sync help
              </summary>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <p>1. Enter the hosted client&apos;s metadata endpoint, usually <span className="font-mono">/v1/database/metadata</span>.</p>
                <p>2. Choose the authentication mode that the client configured in the downloaded Node.js project.</p>
                <p>3. Add any extra headers required by the client&apos;s gateway or reverse proxy.</p>
                <p>4. Click Check Latest to compare schemas first. Use Sync Latest only after reviewing the delta.</p>
              </div>
            </details>

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

            <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="font-semibold text-slate-700">Authentication Mode</span>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={config.authMode}
                  onChange={(event) => setConfig((current) => ({ ...current, authMode: event.target.value as SyncConfig["authMode"] }))}
                >
                  <option value="none">No Authentication</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="apiKey">API Key Header</option>
                  <option value="basic">Basic Auth</option>
                </select>
              </label>

              {config.authMode === "bearer" || config.authMode === "apiKey" ? (
                <>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold text-slate-700">Header Name</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={config.authHeaderName}
                      onChange={(event) => setConfig((current) => ({ ...current, authHeaderName: event.target.value }))}
                      placeholder={config.authMode === "bearer" ? "Authorization" : "X-API-Key"}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold text-slate-700">Token / API Key</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={config.authToken}
                      onChange={(event) => setConfig((current) => ({ ...current, authToken: event.target.value }))}
                      placeholder="Paste the shared secret here"
                    />
                  </label>
                </>
              ) : null}

              {config.authMode === "basic" ? (
                <>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold text-slate-700">Username</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={config.authUsername}
                      onChange={(event) => setConfig((current) => ({ ...current, authUsername: event.target.value }))}
                      placeholder="api-user"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold text-slate-700">Password</span>
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={config.authPassword}
                      onChange={(event) => setConfig((current) => ({ ...current, authPassword: event.target.value }))}
                      placeholder="••••••••"
                      type="password"
                    />
                  </label>
                </>
              ) : null}

              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="font-semibold text-slate-700">Custom Headers JSON</span>
                <textarea
                  className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                  value={config.customHeadersJson}
                  onChange={(event) => setConfig((current) => ({ ...current, customHeadersJson: event.target.value }))}
                  placeholder='{"X-Tenant":"acme"}'
                />
              </label>

              <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                The sync request is sent from Scout to the client&apos;s hosted API using the configured authentication mode and headers.
              </div>
            </div>

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
