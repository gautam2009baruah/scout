"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Database, Loader2, RefreshCw, X } from "lucide-react";
import type { DatabaseNodeConfig } from "@/shared/orchestrationTypes";

type ActiveSchemaOption = {
  id: string;
  targetAppId: string;
  targetAppName: string;
  databaseName: string;
  databaseType: string;
  databaseDescription: string | null;
  version: number;
  updatedAt: string;
};

type PreviewResult = {
  schemaId: string;
  schemaName: string;
  databaseType: string;
  generatedQuery: string;
  reasoning?: string | null;
  sqlValidation?: {
    valid?: boolean;
    mode?: string;
  };
  capturedInput?: Record<string, unknown>;
  generationMeta?: Record<string, unknown>;
  notExecuted?: boolean;
};

type Props = {
  config: Partial<DatabaseNodeConfig> & Record<string, any>;
  updateConfig: (updates: Record<string, unknown>) => void;
  targetAppId?: string | null;
};

function parseMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = String((payload as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

function safeParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: text.trim() ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, error: "Input must be valid JSON." };
  }
}

export function DatabaseNodeConfigPanel({ config, updateConfig, targetAppId }: Props) {
  const [activeSchemas, setActiveSchemas] = useState<ActiveSchemaOption[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [schemasError, setSchemasError] = useState("");
  const [previewSchemaId, setPreviewSchemaId] = useState("");
  const [instruction, setInstruction] = useState("Generate the smallest safe SELECT query that answers the request.");
  const [extractedJson, setExtractedJson] = useState("{}");
  const [additionalContext, setAdditionalContext] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [helpOpen, setHelpOpen] = useState({
    overview: true,
    examples: true,
    safety: true,
    tryout: true,
  });

  const selectedTargetAppId = String(targetAppId || "").trim();
  const selectedSchema = useMemo(
    () => activeSchemas.find((schema) => schema.id === previewSchemaId) || activeSchemas[0] || null,
    [activeSchemas, previewSchemaId]
  );

  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    if (config?.type !== "database") defaults.type = "database";
    if (!String(config?.outputVariable || "").trim()) defaults.outputVariable = "databaseQuery";
    if (!String(config?.userRequestVariablePath || "").trim()) defaults.userRequestVariablePath = "userMessage";
    if (!String(config?.extractedInputVariablePath || "").trim()) defaults.extractedInputVariablePath = "extracted";
    if (!Number.isFinite(Number(config?.maxRows))) defaults.maxRows = 25;
    if (config?.allowSelectStar === undefined) defaults.allowSelectStar = false;

    if (Object.keys(defaults).length > 0) {
      updateConfig(defaults);
    }
  }, [config?.allowSelectStar, config?.extractedInputVariablePath, config?.maxRows, config?.outputVariable, config?.type, config?.userRequestVariablePath, updateConfig]);

  useEffect(() => {
    if (!selectedTargetAppId) {
      setActiveSchemas([]);
      setSchemasError("Select a target app in the orchestration to load active database schemas.");
      return;
    }

    let cancelled = false;
    setLoadingSchemas(true);
    setSchemasError("");

    void fetch(`/api/admin/database-schemas?activeOnly=1&targetAppId=${encodeURIComponent(selectedTargetAppId)}`)
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) {
          setActiveSchemas([]);
          setSchemasError(typeof body?.message === "string" ? body.message : "Unable to load active schemas.");
          return;
        }

        const rows = Array.isArray(body?.schemas) ? (body.schemas as ActiveSchemaOption[]) : [];
        setActiveSchemas(rows);
        setPreviewSchemaId((current) => current || String(config?.schemaId || rows[0]?.id || ""));
      })
      .catch(() => {
        if (cancelled) return;
        setActiveSchemas([]);
        setSchemasError("Unable to load active schemas.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSchemas(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config?.schemaId, selectedTargetAppId]);

  async function runPreview() {
    if (!selectedTargetAppId) {
      setPreviewError("Select a target app first.");
      return;
    }

    if (!previewSchemaId) {
      setPreviewError("Select an active schema first.");
      return;
    }

    if (!instruction.trim()) {
      setPreviewError("Write an instruction for the SQL generator.");
      return;
    }

    const extractedResult = safeParseJson(extractedJson);
    if (!extractedResult.ok) {
      setPreviewError(extractedResult.error);
      return;
    }

    const additionalContextResult = safeParseJson(additionalContext);
    if (!additionalContextResult.ok) {
      setPreviewError(additionalContextResult.error);
      return;
    }

    setPreviewLoading(true);
    setPreviewError("");
    setPreviewResult(null);

    try {
      const response = await fetch("/api/admin/database-node-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAppId: selectedTargetAppId,
          schemaId: previewSchemaId,
          userRequest: instruction,
          extractedInput: extractedResult.value,
          additionalContext: additionalContextResult.value,
          config: {
            outputVariable: config.outputVariable || "databaseQuery",
            userRequestVariablePath: config.userRequestVariablePath || "userMessage",
            extractedInputVariablePath: config.extractedInputVariablePath || "extracted",
            additionalContextVariablePath: config.additionalContextVariablePath || "",
            customInstructions: config.customInstructions || "",
            maxRows: Number(config.maxRows || 25),
            allowSelectStar: config.allowSelectStar === true,
          },
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setPreviewError(parseMessage(body, "Unable to generate SQL preview."));
        return;
      }

      setPreviewResult((body?.preview || null) as PreviewResult | null);
      if (typeof window !== "undefined" && window.showScoutNotification) {
        window.showScoutNotification({ message: "SQL preview generated successfully.", type: "success", duration: 3000 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate SQL preview.";
      setPreviewError(message);
      if (typeof window !== "undefined" && window.showScoutNotification) {
        window.showScoutNotification({ message, type: "error", duration: 5000 });
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  const schemaSelectionRequired = !String(config.schemaId || "").trim();

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          Active Database Schema <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          value={String(config.schemaId || "")}
          onChange={(event) => updateConfig({ schemaId: event.target.value })}
          disabled={loadingSchemas || !selectedTargetAppId}
        >
          <option value="">Select active schema</option>
          {activeSchemas.map((schema) => (
            <option key={schema.id} value={schema.id}>
              {schema.databaseName} ({schema.databaseType}) v{schema.version}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">Mandatory. Only active schemas for the selected target app are shown.</p>
        {schemaSelectionRequired ? <p className="mt-1 text-xs text-red-600">Schema selection is required.</p> : null}
        {schemasError ? <p className="mt-1 text-xs text-red-600">{schemasError}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Output Variable <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            value={String(config.outputVariable || "")}
            onChange={(event) => updateConfig({ outputVariable: event.target.value })}
            placeholder="e.g., databaseQuery"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Max Rows</label>
          <input
            type="number"
            min={1}
            max={500}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            value={Number(config.maxRows || 25)}
            onChange={(event) => updateConfig({ maxRows: Number(event.target.value || 25) })}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">User Request Variable Path</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          value={String(config.userRequestVariablePath || "")}
          onChange={(event) => updateConfig({ userRequestVariablePath: event.target.value })}
          placeholder="e.g., userMessage or trigger.input.userMessage"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">AI Extraction JSON Variable Path</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          value={String(config.extractedInputVariablePath || "")}
          onChange={(event) => updateConfig({ extractedInputVariablePath: event.target.value })}
          placeholder="e.g., extracted"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Additional Context Variable Path</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          value={String(config.additionalContextVariablePath || "")}
          onChange={(event) => updateConfig({ additionalContextVariablePath: event.target.value })}
          placeholder="Optional. Example: trigger.input"
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <input
          id="allowSelectStar"
          type="checkbox"
          className="rounded border-slate-300"
          checked={config.allowSelectStar === true}
          onChange={(event) => updateConfig({ allowSelectStar: event.target.checked })}
        />
        <label htmlFor="allowSelectStar" className="text-sm text-slate-700">
          Allow SELECT * only when it is necessary
        </label>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Custom SQL Generation Instructions</label>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          rows={2}
          value={String(config.customInstructions || "")}
          onChange={(event) => updateConfig({ customInstructions: event.target.value })}
          placeholder="Optional business rules, preferred filters, result shape hints, and exclusions."
        />
      </div>

      <details className="rounded-lg border border-slate-200 bg-white p-3" open={helpOpen.overview} onToggle={(event) => {
        const open = event.currentTarget.open;
        setHelpOpen((current) => ({ ...current, overview: open }));
      }}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">How the Database Node works</summary>
        <div className="mt-3 space-y-2 text-xs text-slate-700">
          <p>1. It receives the user question from the chatbot trigger path.</p>
          <p>2. It receives extracted JSON from AI extraction or any earlier node.</p>
          <p>3. It loads the active schema for the selected target app.</p>
          <p>4. The active company LLM generates a minimal, safe SELECT query.</p>
          <p>5. The node validates the query before it leaves the application.</p>
          <p>6. The query is written into the node output so it appears in triggers monitoring.</p>
        </div>
      </details>

      <details className="rounded-lg border border-slate-200 bg-white p-3" open={helpOpen.examples} onToggle={(event) => {
        const open = event.currentTarget.open;
        setHelpOpen((current) => ({ ...current, examples: open }));
      }}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Sample usage patterns</summary>
        <div className="mt-3 space-y-3 text-xs text-slate-700">
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Order lookup</p>
            <p className="mt-1">Instruction: fetch order id, customer name, and status for the extracted order number.</p>
            <p className="mt-1">Extraction JSON: orderNumber, customerName, orderDate.</p>
            <p className="mt-1">Expected result: minimal SELECT with a WHERE filter on the order number.</p>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Invoice reconciliation</p>
            <p className="mt-1">Instruction: return invoice id, amount, due date, and payment status for the extracted invoice number.</p>
            <p className="mt-1">Extraction JSON: invoiceNumber, vendorName, amount.</p>
            <p className="mt-1">Expected result: no SELECT * and a small projection list.</p>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Customer support record</p>
            <p className="mt-1">Instruction: fetch the smallest set of fields needed to answer the user request.</p>
            <p className="mt-1">Extraction JSON: customerId, ticketId, email.</p>
            <p className="mt-1">Expected result: a query focused on only the relevant table and columns.</p>
          </div>
        </div>
      </details>

      <details className="rounded-lg border border-slate-200 bg-white p-3" open={helpOpen.safety} onToggle={(event) => {
        const open = event.currentTarget.open;
        setHelpOpen((current) => ({ ...current, safety: open }));
      }}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">SQL safety rules</summary>
        <div className="mt-3 space-y-2 text-xs text-slate-700">
          <p>Only a single SELECT statement is allowed.</p>
          <p>Unsafe SQL such as INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, MERGE, EXEC, CALL, and UNION is rejected.</p>
          <p>SELECT * is avoided unless explicitly allowed and absolutely necessary.</p>
          <p>The node caps the result set when the model forgets to add a row limit.</p>
          <p>Generated SQL is validated before it leaves the application so unsafe queries never execute downstream.</p>
        </div>
      </details>

      <details className="rounded-lg border border-slate-200 bg-white p-3" open={helpOpen.tryout} onToggle={(event) => {
        const open = event.currentTarget.open;
        setHelpOpen((current) => ({ ...current, tryout: open }));
      }}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Try out</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Schema</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                value={previewSchemaId}
                onChange={(event) => setPreviewSchemaId(event.target.value)}
                disabled={loadingSchemas || activeSchemas.length === 0}
              >
                <option value="">Select active schema</option>
                {activeSchemas.map((schema) => (
                  <option key={schema.id} value={schema.id}>
                    {schema.databaseName} ({schema.databaseType}) v{schema.version}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Instruction</label>
              <textarea
                className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Describe the query you want the model to generate."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">AI Extraction JSON</label>
              <textarea
                className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-transparent focus:ring-2 focus:ring-blue-500"
                value={extractedJson}
                onChange={(event) => setExtractedJson(event.target.value)}
                placeholder='{"customerName":"Acme Corp"}'
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Additional Context</label>
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                value={additionalContext}
                onChange={(event) => setAdditionalContext(event.target.value)}
                placeholder='Optional context or JSON, for example {"conversationTone":"friendly"}'
              />
            </div>

            {previewError ? <p className="text-sm text-red-600">{previewError}</p> : null}

            <button
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              type="button"
              onClick={() => void runPreview()}
              disabled={previewLoading || loadingSchemas || !previewSchemaId}
            >
              {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {previewLoading ? "Generating..." : "Generate SQL Preview"}
            </button>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-3 text-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Generated SQL</div>
                <button
                  className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  type="button"
                  disabled={!previewResult?.generatedQuery}
                  onClick={async () => {
                    if (!previewResult?.generatedQuery || typeof navigator === "undefined") return;
                    await navigator.clipboard.writeText(previewResult.generatedQuery);
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-100">
                {previewResult?.generatedQuery || "Run the preview to see the SQL query here."}
              </pre>
            </div>

            {previewResult ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                <div><span className="font-semibold text-slate-900">Schema:</span> {previewResult.schemaName}</div>
                <div><span className="font-semibold text-slate-900">Mode:</span> {previewResult.sqlValidation?.mode || "select_only"}</div>
                <div><span className="font-semibold text-slate-900">Not executed:</span> {previewResult.notExecuted ? "Yes" : "No"}</div>
                {previewResult.reasoning ? <div><span className="font-semibold text-slate-900">Reasoning:</span> {previewResult.reasoning}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      </details>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
        The generated SQL is stored in the node output, so it appears in the triggers monitoring screen.
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
        Manage active schemas in <a href="/control-panel/administration/database-schema" className="font-semibold text-blue-700 underline hover:text-blue-800" target="_blank" rel="noreferrer">Database Schema Manager</a>.
      </div>
    </div>
  );
}
