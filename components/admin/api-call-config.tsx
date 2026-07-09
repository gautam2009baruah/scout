/**
 * API Call Node Configuration Component
 * Allows configuration of HTTP requests with auth, payload templating, and response mapping
 */

import { useState, useEffect } from "react";
import { Plus, Minus } from "lucide-react";

export function ApiCallConfig({ config, updateConfig }: any) {
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    Object.entries(config.headers || {}).map(([key, value]) => ({ key, value: value as string }))
  );
  const [responseMapping, setResponseMapping] = useState<Array<{ outputKey: string; jsonPath: string }>>(
    Object.entries(config.responseMapping || {}).map(([outputKey, jsonPath]) => ({ outputKey, jsonPath: jsonPath as string }))
  );

  // Update parent config when headers change
  useEffect(() => {
    const headersObj = headers.reduce((acc, h) => {
      if (h.key) acc[h.key] = h.value;
      return acc;
    }, {} as Record<string, string>);
    updateConfig({ headers: headersObj });
  }, [headers]);

  // Update parent config when response mapping changes
  useEffect(() => {
    const mappingObj = responseMapping.reduce((acc, m) => {
      if (m.outputKey) acc[m.outputKey] = m.jsonPath;
      return acc;
    }, {} as Record<string, string>);
    updateConfig({ responseMapping: mappingObj });
  }, [responseMapping]);

  return (
    <div className="space-y-4">
      {/* Help Section */}
      <details className="border border-slate-300 rounded-lg bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
          🌐 What is an API Call Node?
        </summary>
        <div className="px-4 py-3 space-y-3 text-sm border-t border-slate-200 bg-blue-50">
          <p className="text-blue-800">
            The API Call node makes HTTP requests to external services and captures responses.
          </p>
          <div className="space-y-2 text-xs text-blue-700">
            <p><strong>Use Case:</strong> Process payment, fetch data, send data to third-party service</p>
            <p><strong>Features:</strong> Retry logic, auth headers, response mapping, error handling</p>
            <p><strong>Example:</strong> Send order to payment provider, get transaction ID back</p>
          </div>
        </div>
      </details>

      {/* API URL */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          API URL <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
          value={config.apiUrl || ""}
          onChange={(e) => updateConfig({ apiUrl: e.target.value })}
          placeholder="https://api.payment.com/charge"
        />
        <p className="mt-1 text-xs text-slate-500">
          Supports <code className="bg-slate-100 px-1 rounded text-[10px]">{`{{variable}}`}</code> expressions
        </p>
      </div>

      {/* HTTP Method */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          HTTP Method <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.method || "POST"}
          onChange={(e) => updateConfig({ method: e.target.value })}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>

      {/* Authentication */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">🔐 Authentication</h4>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={config.auth?.type || "none"}
            onChange={(e) => {
              const newAuth = { ...config.auth, type: e.target.value };
              updateConfig({ auth: newAuth });
            }}
          >
            <option value="none">None</option>
            <option value="api_key">API Key</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
          </select>
        </div>

        {/* API Key Auth */}
        {config.auth?.type === "api_key" && (
          <div className="mt-3 space-y-3">
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Header name (e.g., X-API-Key)"
              value={config.auth?.headerName || "X-API-Key"}
              onChange={(e) => {
                const newAuth = { ...config.auth, headerName: e.target.value };
                updateConfig({ auth: newAuth });
              }}
            />
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder="API Key value (supports {{variable}} expressions)"
              value={config.auth?.value || ""}
              onChange={(e) => {
                const newAuth = { ...config.auth, value: e.target.value };
                updateConfig({ auth: newAuth });
              }}
            />
          </div>
        )}

        {/* Bearer Token Auth */}
        {config.auth?.type === "bearer" && (
          <div className="mt-3">
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder="Token (supports {{variable}} expressions)"
              value={config.auth?.token || ""}
              onChange={(e) => {
                const newAuth = { ...config.auth, token: e.target.value };
                updateConfig({ auth: newAuth });
              }}
            />
          </div>
        )}

        {/* Basic Auth */}
        {config.auth?.type === "basic" && (
          <div className="mt-3 space-y-3">
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Username"
              value={config.auth?.username || ""}
              onChange={(e) => {
                const newAuth = { ...config.auth, username: e.target.value };
                updateConfig({ auth: newAuth });
              }}
            />
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Password"
              value={config.auth?.password || ""}
              onChange={(e) => {
                const newAuth = { ...config.auth, password: e.target.value };
                updateConfig({ auth: newAuth });
              }}
            />
          </div>
        )}
      </div>

      {/* Custom Headers */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-700">📋 Custom Headers</h4>
          <button
            type="button"
            onClick={() => setHeaders([...headers, { key: "", value: "" }])}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        
        <div className="space-y-2">
          {headers.map((header, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Header name"
                value={header.key}
                onChange={(e) => {
                  const updated = [...headers];
                  updated[index].key = e.target.value;
                  setHeaders(updated);
                }}
              />
              <input
                type="text"
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono"
                placeholder="Value (supports expressions)"
                value={header.value}
                onChange={(e) => {
                  const updated = [...headers];
                  updated[index].value = e.target.value;
                  setHeaders(updated);
                }}
              />
              <button
                type="button"
                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                onClick={() => setHeaders(headers.filter((_, i) => i !== index))}
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Request Body */}
      {config.method !== "GET" && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Request Body (JSON)
          </label>
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
            rows={5}
            value={config.requestBodyTemplate || ""}
            onChange={(e) => updateConfig({ requestBodyTemplate: e.target.value })}
            placeholder={'{\n  "amount": {{extractedData.amount}},\n  "email": "{{trigger.input.email}}"\n}'}
          />
          <p className="mt-1 text-xs text-slate-500">
            Supports <code className="bg-slate-100 px-1 rounded text-[10px]">{`{{variable}}`}</code> expressions. Leave empty for no body.
          </p>
        </div>
      )}

      {/* Response Mapping */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-700">📤 Response Mapping</h4>
          <button
            type="button"
            onClick={() => setResponseMapping([...responseMapping, { outputKey: "", jsonPath: "" }])}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        
        <p className="text-xs text-slate-500 mb-2">
          Extract fields from API response using dot notation (e.g., <code className="bg-slate-100 px-1 rounded text-[10px]">data.transaction.id</code>)
        </p>
        
        <div className="space-y-2">
          {responseMapping.map((mapping, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Output variable name"
                value={mapping.outputKey}
                onChange={(e) => {
                  const updated = [...responseMapping];
                  updated[index].outputKey = e.target.value;
                  setResponseMapping(updated);
                }}
              />
              <input
                type="text"
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono"
                placeholder="data.transaction.id"
                value={mapping.jsonPath}
                onChange={(e) => {
                  const updated = [...responseMapping];
                  updated[index].jsonPath = e.target.value;
                  setResponseMapping(updated);
                }}
              />
              <button
                type="button"
                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                onClick={() => setResponseMapping(responseMapping.filter((_, i) => i !== index))}
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Timeout */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Timeout (ms) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          min="1000"
          step="1000"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={config.timeout || 30000}
          onChange={(e) => updateConfig({ timeout: parseInt(e.target.value) })}
        />
        <p className="mt-1 text-xs text-slate-500">Default: 30000 (30 seconds)</p>
      </div>

      {/* Retry Settings */}
      <div className="border-t pt-4 space-y-2">
        <h4 className="text-sm font-semibold text-slate-700">🔄 Retry Settings</h4>
        
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Retry Attempts</label>
          <input
            type="number"
            min="0"
            max="5"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={config.retryAttempts || 2}
            onChange={(e) => updateConfig({ retryAttempts: parseInt(e.target.value) })}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Retry Delay (ms)</label>
          <input
            type="number"
            min="100"
            step="100"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={config.retryDelayMs || 1000}
            onChange={(e) => updateConfig({ retryDelayMs: parseInt(e.target.value) })}
          />
          <p className="mt-1 text-xs text-slate-500">Uses exponential backoff: delay × 2^attempt</p>
        </div>
      </div>

      {/* Failure Strategy */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          On Failure <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={config.failureStrategy || "stop"}
          onChange={(e) => updateConfig({ failureStrategy: e.target.value })}
        >
          <option value="stop">Stop orchestration</option>
          <option value="continue">Continue execution (flag error)</option>
          <option value="alert">Log alert but continue</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          What to do if API call fails after all retries
        </p>
      </div>
    </div>
  );
}
