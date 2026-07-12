/**
 * Generic API Call Node Configuration Component
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Minus } from "lucide-react";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const BODY_FORMATS = [
  { value: "none", label: "None" },
  { value: "json", label: "JSON" },
  { value: "form_data", label: "Form-data" },
  { value: "url_encoded", label: "URL-encoded" },
  { value: "raw_text", label: "Raw text" },
  { value: "xml", label: "XML" },
  { value: "binary", label: "Binary (Base64)" },
];

const AUTH_TYPES = [
  { value: "none", label: "No authentication" },
  { value: "api_key", label: "API key" },
  { value: "bearer", label: "Bearer token" },
  { value: "basic", label: "Basic authentication" },
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "custom_headers", label: "Custom headers" },
];

export function ApiCallConfig({ config, updateConfig }: any) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    request: true,
    authentication: true,
    advanced: false,
    response: true,
  });

  const [testState, setTestState] = useState<{
    loading: boolean;
    status: "idle" | "success" | "error";
    message: string;
    payload: any;
  }>({ loading: false, status: "idle", message: "", payload: null });

  useEffect(() => {
    const defaults = {
      type: "api_call",
      apiUrl: config.apiUrl || "",
      method: config.method || "POST",
      pathVariables: Array.isArray(config.pathVariables) ? config.pathVariables : [],
      queryParameters: Array.isArray(config.queryParameters) ? config.queryParameters : [],
      headers: Array.isArray(config.headers)
        ? config.headers
        : Object.entries(config.headers || {}).map(([key, value]) => ({
            key,
            value: String(value),
            enabled: true,
            secret: false,
          })),
      bodyFormat: config.bodyFormat || "json",
      requestBodyTemplate: config.requestBodyTemplate || "",
      formDataFields: Array.isArray(config.formDataFields) ? config.formDataFields : [],
      urlEncodedFields: Array.isArray(config.urlEncodedFields) ? config.urlEncodedFields : [],
      binaryBodyBase64: config.binaryBodyBase64 || "",
      fileUploads: Array.isArray(config.fileUploads) ? config.fileUploads : [],
      auth: {
        type: config.auth?.type || "none",
        apiKey: {
          location: config.auth?.apiKey?.location || "header",
          name: config.auth?.apiKey?.name || config.auth?.headerName || "X-API-Key",
          value: config.auth?.apiKey?.value || config.auth?.value || "",
        },
        bearerToken: config.auth?.bearerToken || config.auth?.token || "",
        basic: {
          username: config.auth?.basic?.username || config.auth?.username || "",
          password: config.auth?.basic?.password || config.auth?.password || "",
        },
        oauth2: {
          accessToken: config.auth?.oauth2?.accessToken || "",
          tokenUrl: config.auth?.oauth2?.tokenUrl || "",
          clientId: config.auth?.oauth2?.clientId || "",
          clientSecret: config.auth?.oauth2?.clientSecret || "",
          scope: config.auth?.oauth2?.scope || "",
          audience: config.auth?.oauth2?.audience || "",
          grantType: config.auth?.oauth2?.grantType || "client_credentials",
          username: config.auth?.oauth2?.username || "",
          password: config.auth?.oauth2?.password || "",
          authStyle: config.auth?.oauth2?.authStyle || "basic",
        },
        customHeaders: Array.isArray(config.auth?.customHeaders) ? config.auth.customHeaders : [],
        mtls: {
          enabled: config.auth?.mtls?.enabled === true,
          certPath: config.auth?.mtls?.certPath || "",
          keyPath: config.auth?.mtls?.keyPath || "",
          caPath: config.auth?.mtls?.caPath || "",
          passphrase: config.auth?.mtls?.passphrase || "",
        },
      },
      timeout: Number(config.timeout || 30000),
      retryAttempts: Number(config.retryAttempts || 2),
      retryDelayMs: Number(config.retryDelayMs || 1000),
      failureStrategy: config.failureStrategy || "stop",
      successStatusCodes: config.successStatusCodes || "200-299",
      outputVariableName: config.outputVariableName || "apiResult",
      responseFieldMappings: Array.isArray(config.responseFieldMappings)
        ? config.responseFieldMappings
        : Object.entries(config.responseMapping || {}).map(([outputKey, jsonPath]) => ({ outputKey, jsonPath: String(jsonPath) })),
      includeRawResponse: config.includeRawResponse !== false,
    };

    updateConfig(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validation = useMemo(() => {
    const errors: string[] = [];

    if (!String(config.apiUrl || "").trim()) {
      errors.push("API URL is required.");
    }

    if (!/^https?:\/\//i.test(String(config.apiUrl || "").trim())) {
      errors.push("API URL should start with http:// or https://.");
    }

    if (!String(config.outputVariableName || "").trim()) {
      errors.push("Output variable name is required.");
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(config.outputVariableName || ""))) {
      errors.push("Output variable name must be a valid identifier (letters, numbers, underscore). ");
    }

    if (config.auth?.type === "api_key") {
      if (!String(config.auth?.apiKey?.name || "").trim()) errors.push("API key auth requires key name.");
      if (!String(config.auth?.apiKey?.value || "").trim()) errors.push("API key auth requires key value.");
    }

    if (config.auth?.type === "bearer" && !String(config.auth?.bearerToken || "").trim()) {
      errors.push("Bearer auth requires token.");
    }

    if (config.auth?.type === "basic") {
      if (!String(config.auth?.basic?.username || "").trim()) errors.push("Basic auth requires username.");
    }

    if (config.auth?.type === "oauth2") {
      const hasDirectToken = String(config.auth?.oauth2?.accessToken || "").trim();
      const hasTokenFlow =
        String(config.auth?.oauth2?.tokenUrl || "").trim() &&
        String(config.auth?.oauth2?.clientId || "").trim() &&
        String(config.auth?.oauth2?.clientSecret || "").trim();
      if (!hasDirectToken && !hasTokenFlow) {
        errors.push("OAuth2 requires either an access token or token URL + client credentials.");
      }
    }

    if (config.auth?.mtls?.enabled) {
      if (!String(config.auth?.mtls?.certPath || "").trim()) errors.push("mTLS requires certificate path.");
      if (!String(config.auth?.mtls?.keyPath || "").trim()) errors.push("mTLS requires key path.");
    }

    if (config.bodyFormat === "binary" && !String(config.binaryBodyBase64 || config.requestBodyTemplate || "").trim()) {
      errors.push("Binary body format requires base64 payload.");
    }

    return errors;
  }, [config]);

  const setTopLevel = (updates: Record<string, any>) => updateConfig({ ...updates });

  const setArrayField = (field: string, value: any[]) => updateConfig({ [field]: value });

  const updateRow = (field: string, index: number, updates: Record<string, any>) => {
    const rows = Array.isArray(config[field]) ? [...config[field]] : [];
    rows[index] = { ...(rows[index] || {}), ...updates };
    setArrayField(field, rows);
  };

  const removeRow = (field: string, index: number) => {
    const rows = Array.isArray(config[field]) ? [...config[field]] : [];
    setArrayField(field, rows.filter((_: any, i: number) => i !== index));
  };

  const addRow = (field: string, payload: Record<string, any>) => {
    const rows = Array.isArray(config[field]) ? [...config[field]] : [];
    setArrayField(field, [...rows, payload]);
  };

  const setAuth = (updates: Record<string, any>) => {
    updateConfig({ auth: { ...(config.auth || {}), ...updates } });
  };

  const setAuthNested = (field: string, updates: Record<string, any>) => {
    setAuth({ [field]: { ...(config.auth?.[field] || {}), ...updates } });
  };

  const toggleSection = (name: string) => {
    setOpenSections((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const parseHeadersForPreview = () => {
    const input = Array.isArray(config.headers) ? config.headers : [];
    const output: Record<string, string> = {};
    for (const row of input) {
      if (row?.enabled === false) continue;
      const key = String(row.key || "").trim();
      if (!key) continue;
      output[key] = row.secret ? maskValue(String(row.value || "")) : String(row.value || "");
    }
    return output;
  };

  const handleTestRequest = async () => {
    setTestState({ loading: true, status: "idle", message: "Sending test request...", payload: null });
    try {
      const response = await fetch("/api/admin/orchestrations/test-api-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          context: {
            trigger: { id: "test-trigger", timestamp: new Date().toISOString() },
            variables: { customerId: "CUST-1001", orderId: "ORD-9001" },
            workflow: { currentNode: "api_call" },
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload?.result?.success === false) {
        throw new Error(payload?.result?.error || payload?.message || payload?.error || "Test request failed");
      }

      setTestState({ loading: false, status: "success", message: "Test request completed.", payload: payload.result });
    } catch (error) {
      setTestState({
        loading: false,
        status: "error",
        message: error instanceof Error ? error.message : "Test request failed",
        payload: null,
      });
    }
  };

  return (
    <div className="space-y-4">
      <details className="border border-slate-300 rounded-lg bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
          Generic API Node Help
        </summary>
        <div className="px-4 py-3 space-y-2 text-xs border-t border-slate-200 bg-blue-50 text-blue-800">
          <p>This node can call any external HTTP API and pass response values to the next nodes.</p>
          <p>Variables supported in all fields: {{"{{variables.orderId}}"}}, {{"{{trigger.timestamp}}"}}, {{"{{workflow.currentNode}}"}}.</p>
          <p>Sample GET URL with path variable: https://api.example.com/customers/{"{id}"}</p>
          <p>Sample success status codes: 200-299,304</p>
        </div>
      </details>

      {validation.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-800">Validation</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-red-700 space-y-0.5">
            {validation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <Section title="Request" open={!!openSections.request} onToggle={() => toggleSection("request")}>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">HTTP method <span className="text-red-500">*</span></label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={config.method || "POST"}
            onChange={(e) => setTopLevel({ method: e.target.value })}
          >
            {METHODS.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">URL <span className="text-red-500">*</span></label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            value={config.apiUrl || ""}
            onChange={(e) => setTopLevel({ apiUrl: e.target.value })}
            placeholder="https://api.example.com/orders/{orderId}"
          />
          <p className="mt-1 text-xs text-slate-500">Use path placeholders like {"{orderId}"} or :orderId with dynamic values below.</p>
        </div>

        <ArrayEditor
          title="Path variables"
          rows={Array.isArray(config.pathVariables) ? config.pathVariables : []}
          onAdd={() => addRow("pathVariables", { name: "", value: "" })}
          renderRow={(row, index) => (
            <div className="grid grid-cols-2 gap-2" key={`path-${index}`}>
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="orderId"
                value={row.name || ""}
                onChange={(e) => updateRow("pathVariables", index, { name: e.target.value })}
              />
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="{{variables.orderId}}"
                value={row.value || ""}
                onChange={(e) => updateRow("pathVariables", index, { value: e.target.value })}
              />
            </div>
          )}
          onRemove={(index) => removeRow("pathVariables", index)}
        />

        <ArrayEditor
          title="Query parameters"
          rows={Array.isArray(config.queryParameters) ? config.queryParameters : []}
          onAdd={() => addRow("queryParameters", { key: "", value: "", enabled: true })}
          renderRow={(row, index) => (
            <div className="grid grid-cols-3 gap-2" key={`query-${index}`}>
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="limit"
                value={row.key || ""}
                onChange={(e) => updateRow("queryParameters", index, { key: e.target.value })}
              />
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="50"
                value={row.value || ""}
                onChange={(e) => updateRow("queryParameters", index, { value: e.target.value })}
              />
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={row.enabled !== false}
                  onChange={(e) => updateRow("queryParameters", index, { enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>
          )}
          onRemove={(index) => removeRow("queryParameters", index)}
        />

        <ArrayEditor
          title="Request headers"
          rows={Array.isArray(config.headers) ? config.headers : []}
          onAdd={() => addRow("headers", { key: "", value: "", enabled: true, secret: false })}
          renderRow={(row, index) => (
            <div className="grid grid-cols-5 gap-2" key={`header-${index}`}>
              <input
                type="text"
                className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="X-Correlation-Id"
                value={row.key || ""}
                onChange={(e) => updateRow("headers", index, { key: e.target.value })}
              />
              <input
                type="text"
                className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
                placeholder="{{variables.correlationId}}"
                value={row.value || ""}
                onChange={(e) => updateRow("headers", index, { value: e.target.value })}
              />
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={row.enabled !== false}
                    onChange={(e) => updateRow("headers", index, { enabled: e.target.checked })}
                  />
                  On
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={row.secret === true}
                    onChange={(e) => updateRow("headers", index, { secret: e.target.checked })}
                  />
                  Secret
                </label>
              </div>
            </div>
          )}
          onRemove={(index) => removeRow("headers", index)}
        />

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Body format</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={config.bodyFormat || "json"}
            onChange={(e) => setTopLevel({ bodyFormat: e.target.value })}
          >
            {BODY_FORMATS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        {(config.bodyFormat === "json" || config.bodyFormat === "raw_text" || config.bodyFormat === "xml") && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Body template</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              rows={5}
              value={config.requestBodyTemplate || ""}
              onChange={(e) => setTopLevel({ requestBodyTemplate: e.target.value })}
              placeholder={
                config.bodyFormat === "json"
                  ? '{"orderId":"{{variables.orderId}}"}'
                  : config.bodyFormat === "xml"
                  ? '<order><id>{{variables.orderId}}</id></order>'
                  : 'raw payload text'
              }
            />
            <p className="mt-1 text-xs text-slate-500">Supports dynamic values from previous nodes.</p>
          </div>
        )}

        {config.bodyFormat === "url_encoded" && (
          <ArrayEditor
            title="URL-encoded fields"
            rows={Array.isArray(config.urlEncodedFields) ? config.urlEncodedFields : []}
            onAdd={() => addRow("urlEncodedFields", { key: "", value: "", enabled: true })}
            renderRow={(row, index) => (
              <div className="grid grid-cols-3 gap-2" key={`urlenc-${index}`}>
                <input
                  type="text"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="field"
                  value={row.key || ""}
                  onChange={(e) => updateRow("urlEncodedFields", index, { key: e.target.value })}
                />
                <input
                  type="text"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="value"
                  value={row.value || ""}
                  onChange={(e) => updateRow("urlEncodedFields", index, { value: e.target.value })}
                />
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.enabled !== false}
                    onChange={(e) => updateRow("urlEncodedFields", index, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>
            )}
            onRemove={(index) => removeRow("urlEncodedFields", index)}
          />
        )}

        {config.bodyFormat === "form_data" && (
          <>
            <ArrayEditor
              title="Form-data fields"
              rows={Array.isArray(config.formDataFields) ? config.formDataFields : []}
              onAdd={() => addRow("formDataFields", { key: "", value: "", isFile: false, enabled: true })}
              renderRow={(row, index) => (
                <div className="space-y-2" key={`form-${index}`}>
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="text"
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      placeholder="field"
                      value={row.key || ""}
                      onChange={(e) => updateRow("formDataFields", index, { key: e.target.value })}
                    />
                    <label className="flex items-center gap-1 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.isFile === true}
                        onChange={(e) => updateRow("formDataFields", index, { isFile: e.target.checked })}
                      />
                      File
                    </label>
                    <label className="flex items-center gap-1 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.enabled !== false}
                        onChange={(e) => updateRow("formDataFields", index, { enabled: e.target.checked })}
                      />
                      Enabled
                    </label>
                  </div>
                  {row.isFile ? (
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        placeholder="C:/path/file.pdf"
                        value={row.filePath || ""}
                        onChange={(e) => updateRow("formDataFields", index, { filePath: e.target.value })}
                      />
                      <input
                        type="text"
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        placeholder="file.pdf (optional)"
                        value={row.fileName || ""}
                        onChange={(e) => updateRow("formDataFields", index, { fileName: e.target.value })}
                      />
                      <input
                        type="text"
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        placeholder="application/pdf"
                        value={row.contentType || ""}
                        onChange={(e) => updateRow("formDataFields", index, { contentType: e.target.value })}
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      placeholder="value"
                      value={row.value || ""}
                      onChange={(e) => updateRow("formDataFields", index, { value: e.target.value })}
                    />
                  )}
                </div>
              )}
              onRemove={(index) => removeRow("formDataFields", index)}
            />

            <ArrayEditor
              title="Additional file uploads"
              rows={Array.isArray(config.fileUploads) ? config.fileUploads : []}
              onAdd={() => addRow("fileUploads", { fieldName: "", filePath: "", fileName: "", contentType: "", enabled: true })}
              renderRow={(row, index) => (
                <div className="grid grid-cols-5 gap-2" key={`upload-${index}`}>
                  <input
                    type="text"
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="field"
                    value={row.fieldName || ""}
                    onChange={(e) => updateRow("fileUploads", index, { fieldName: e.target.value })}
                  />
                  <input
                    type="text"
                    className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="C:/path/file.png"
                    value={row.filePath || ""}
                    onChange={(e) => updateRow("fileUploads", index, { filePath: e.target.value })}
                  />
                  <input
                    type="text"
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="file name"
                    value={row.fileName || ""}
                    onChange={(e) => updateRow("fileUploads", index, { fileName: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={row.enabled !== false}
                      onChange={(e) => updateRow("fileUploads", index, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>
              )}
              onRemove={(index) => removeRow("fileUploads", index)}
            />
          </>
        )}

        {config.bodyFormat === "binary" && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Binary payload (base64)</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              rows={5}
              value={config.binaryBodyBase64 || ""}
              onChange={(e) => setTopLevel({ binaryBodyBase64: e.target.value })}
              placeholder="JVBERi0xLjQKJ..."
            />
          </div>
        )}

        <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
          <p className="mt-2">Sample request: POST https://api.example.com/orders/{"{id}"}?expand=items with JSON body and Authorization header.</p>
        </details>
      </Section>

      <Section title="Authentication" open={!!openSections.authentication} onToggle={() => toggleSection("authentication")}>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Authentication method</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={config.auth?.type || "none"}
            onChange={(e) => setAuth({ type: e.target.value })}
          >
            {AUTH_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        {config.auth?.type === "api_key" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={config.auth?.apiKey?.location || "header"}
              onChange={(e) => setAuthNested("apiKey", { location: e.target.value })}
            >
              <option value="header">Header</option>
              <option value="query">Query parameter</option>
            </select>
            <input
              type="text"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="X-API-Key"
              value={config.auth?.apiKey?.name || ""}
              onChange={(e) => setAuthNested("apiKey", { name: e.target.value })}
            />
            <input
              type="password"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="secret"
              value={config.auth?.apiKey?.value || ""}
              onChange={(e) => setAuthNested("apiKey", { value: e.target.value })}
            />
          </div>
        )}

        {config.auth?.type === "bearer" && (
          <input
            type="password"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Bearer token"
            value={config.auth?.bearerToken || ""}
            onChange={(e) => setAuth({ bearerToken: e.target.value })}
          />
        )}

        {config.auth?.type === "basic" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="username"
              value={config.auth?.basic?.username || ""}
              onChange={(e) => setAuthNested("basic", { username: e.target.value })}
            />
            <input
              type="password"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="password"
              value={config.auth?.basic?.password || ""}
              onChange={(e) => setAuthNested("basic", { password: e.target.value })}
            />
          </div>
        )}

        {config.auth?.type === "oauth2" && (
          <div className="space-y-2">
            <input
              type="password"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Access token (optional if token URL is configured)"
              value={config.auth?.oauth2?.accessToken || ""}
              onChange={(e) => setAuthNested("oauth2", { accessToken: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Token URL"
                value={config.auth?.oauth2?.tokenUrl || ""}
                onChange={(e) => setAuthNested("oauth2", { tokenUrl: e.target.value })}
              />
              <select
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={config.auth?.oauth2?.grantType || "client_credentials"}
                onChange={(e) => setAuthNested("oauth2", { grantType: e.target.value })}
              >
                <option value="client_credentials">client_credentials</option>
                <option value="password">password</option>
              </select>
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Client ID"
                value={config.auth?.oauth2?.clientId || ""}
                onChange={(e) => setAuthNested("oauth2", { clientId: e.target.value })}
              />
              <input
                type="password"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Client secret"
                value={config.auth?.oauth2?.clientSecret || ""}
                onChange={(e) => setAuthNested("oauth2", { clientSecret: e.target.value })}
              />
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Scope"
                value={config.auth?.oauth2?.scope || ""}
                onChange={(e) => setAuthNested("oauth2", { scope: e.target.value })}
              />
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Audience"
                value={config.auth?.oauth2?.audience || ""}
                onChange={(e) => setAuthNested("oauth2", { audience: e.target.value })}
              />
            </div>
          </div>
        )}

        {config.auth?.type === "custom_headers" && (
          <ArrayEditor
            title="Custom auth headers"
            rows={Array.isArray(config.auth?.customHeaders) ? config.auth.customHeaders : []}
            onAdd={() => setAuth({ customHeaders: [...(config.auth?.customHeaders || []), { key: "", value: "", secret: true }] })}
            renderRow={(row, index) => (
              <div className="grid grid-cols-4 gap-2" key={`auth-h-${index}`}>
                <input
                  type="text"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Header"
                  value={row.key || ""}
                  onChange={(e) => {
                    const next = [...(config.auth?.customHeaders || [])];
                    next[index] = { ...(next[index] || {}), key: e.target.value };
                    setAuth({ customHeaders: next });
                  }}
                />
                <input
                  type={row.secret ? "password" : "text"}
                  className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Value"
                  value={row.value || ""}
                  onChange={(e) => {
                    const next = [...(config.auth?.customHeaders || [])];
                    next[index] = { ...(next[index] || {}), value: e.target.value };
                    setAuth({ customHeaders: next });
                  }}
                />
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.secret !== false}
                    onChange={(e) => {
                      const next = [...(config.auth?.customHeaders || [])];
                      next[index] = { ...(next[index] || {}), secret: e.target.checked };
                      setAuth({ customHeaders: next });
                    }}
                  />
                  Secret
                </label>
              </div>
            )}
            onRemove={(index) => {
              const next = [...(config.auth?.customHeaders || [])].filter((_, i) => i !== index);
              setAuth({ customHeaders: next });
            }}
          />
        )}

        <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
          <p className="mt-2">Secrets are masked in preview. Use OAuth2 access token directly if you already have one; otherwise configure token endpoint and client credentials.</p>
        </details>
      </Section>

      <Section title="Advanced Settings" open={!!openSections.advanced} onToggle={() => toggleSection("advanced")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Timeout (ms)</label>
            <input
              type="number"
              min={100}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={config.timeout || 30000}
              onChange={(e) => setTopLevel({ timeout: Number(e.target.value || 30000) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Retry attempts</label>
            <input
              type="number"
              min={0}
              max={10}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={config.retryAttempts || 0}
              onChange={(e) => setTopLevel({ retryAttempts: Number(e.target.value || 0) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Retry delay (ms)</label>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={config.retryDelayMs || 1000}
              onChange={(e) => setTopLevel({ retryDelayMs: Number(e.target.value || 1000) })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Failure strategy</label>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={config.failureStrategy || "stop"}
            onChange={(e) => setTopLevel({ failureStrategy: e.target.value })}
          >
            <option value="stop">Stop orchestration</option>
            <option value="continue">Continue with error output</option>
            <option value="alert">Continue and log alert</option>
          </select>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Client certificate / mTLS</p>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={config.auth?.mtls?.enabled === true}
                onChange={(e) => setAuthNested("mtls", { enabled: e.target.checked })}
              />
              Enabled
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Certificate path"
              value={config.auth?.mtls?.certPath || ""}
              onChange={(e) => setAuthNested("mtls", { certPath: e.target.value })}
            />
            <input
              type="text"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Private key path"
              value={config.auth?.mtls?.keyPath || ""}
              onChange={(e) => setAuthNested("mtls", { keyPath: e.target.value })}
            />
            <input
              type="text"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="CA path (optional)"
              value={config.auth?.mtls?.caPath || ""}
              onChange={(e) => setAuthNested("mtls", { caPath: e.target.value })}
            />
            <input
              type="password"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Passphrase (optional)"
              value={config.auth?.mtls?.passphrase || ""}
              onChange={(e) => setAuthNested("mtls", { passphrase: e.target.value })}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Use absolute file paths accessible to the server process.</p>
        </div>

        <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
          <p className="mt-2">Retry uses exponential backoff. Timeout covers total request duration per attempt. mTLS requires cert and key files on the host where orchestration runs.</p>
        </details>
      </Section>

      <Section title="Response Handling" open={!!openSections.response} onToggle={() => toggleSection("response")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Success status codes</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={config.successStatusCodes || "200-299"}
              onChange={(e) => setTopLevel({ successStatusCodes: e.target.value })}
              placeholder="200-299,304"
            />
            <p className="mt-1 text-xs text-slate-500">Accepted formats: 200, 200-299, 2xx, comma separated.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Output variable name <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={config.outputVariableName || "apiResult"}
              onChange={(e) => setTopLevel({ outputVariableName: e.target.value })}
              placeholder="apiResult"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={config.includeRawResponse !== false}
            onChange={(e) => setTopLevel({ includeRawResponse: e.target.checked })}
          />
          Include raw response in output
        </label>

        <ArrayEditor
          title="Response field mappings"
          rows={Array.isArray(config.responseFieldMappings) ? config.responseFieldMappings : []}
          onAdd={() => addRow("responseFieldMappings", { outputKey: "", jsonPath: "" })}
          renderRow={(row, index) => (
            <div className="grid grid-cols-2 gap-2" key={`map-${index}`}>
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="customerEmail"
                value={row.outputKey || ""}
                onChange={(e) => updateRow("responseFieldMappings", index, { outputKey: e.target.value })}
              />
              <input
                type="text"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
                placeholder="data.customer.email"
                value={row.jsonPath || ""}
                onChange={(e) => updateRow("responseFieldMappings", index, { jsonPath: e.target.value })}
              />
            </div>
          )}
          onRemove={(index) => removeRow("responseFieldMappings", index)}
        />

        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">Test request and preview</p>
            <button
              type="button"
              onClick={handleTestRequest}
              disabled={testState.loading || validation.length > 0}
              className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {testState.loading ? "Testing..." : "Test request"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Secrets are masked below. Test uses sample context values for variable interpolation.</p>

          <div className="mt-3 rounded border border-slate-200 bg-white p-2 text-xs space-y-1">
            <p><span className="font-semibold">Request:</span> {(config.method || "POST")} {config.apiUrl || "(no URL)"}</p>
            <p><span className="font-semibold">Headers:</span> {JSON.stringify(parseHeadersForPreview())}</p>
          </div>

          {testState.status !== "idle" && (
            <div className={`mt-3 rounded border p-2 text-xs ${testState.status === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {testState.message}
            </div>
          )}

          {testState.payload && (
            <div className="mt-3 rounded border border-slate-200 bg-white p-2">
              <p className="text-xs font-semibold text-slate-700 mb-1">Response preview</p>
              <pre className="max-h-64 overflow-auto text-[11px] text-slate-700 whitespace-pre-wrap">{JSON.stringify(testState.payload, null, 2)}</pre>
            </div>
          )}
        </div>

        <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Sample examples</summary>
          <div className="mt-2 space-y-2">
            <p><strong>REST GET:</strong> GET https://api.example.com/customers/{"{customerId}"}</p>
            <p><strong>POST JSON:</strong> Body: {`{"orderId":"{{variables.orderId}}"}`}</p>
            <p><strong>Response map:</strong> output customerEmail from data.customer.email</p>
          </div>
        </details>
      </Section>
    </div>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
      </button>

      {open && <div className="border-t border-slate-200 p-3 space-y-3">{children}</div>}
    </div>
  );
}

function ArrayEditor({
  title,
  rows,
  onAdd,
  renderRow,
  onRemove,
}: {
  title: string;
  rows: any[];
  onAdd: () => void;
  renderRow: (row: any, index: number) => React.ReactNode;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {rows.length === 0 && <p className="text-xs text-slate-500">No items configured.</p>}

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="rounded border border-slate-200 bg-slate-50 p-2 space-y-2">
            {renderRow(row, index)}
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="inline-flex items-center gap-1 text-xs text-red-700 hover:text-red-800"
            >
              <Minus className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
