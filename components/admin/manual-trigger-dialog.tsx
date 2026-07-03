/**
 * Manual Trigger Dialog
 * Allows users to manually start an orchestration with input fields
 */

"use client";

import { useState } from "react";
import { X, Play, Loader2 } from "lucide-react";
import type { ManualTriggerConfig } from "@/shared/orchestrationTypes";

interface ManualTriggerDialogProps {
  orchestrationId: string;
  orchestrationName: string;
  triggerConfig: ManualTriggerConfig;
  onClose: () => void;
  onSuccess: (executionId: string) => void;
}

export function ManualTriggerDialog({
  orchestrationId,
  orchestrationName,
  triggerConfig,
  onClose,
  onSuccess,
}: ManualTriggerDialogProps) {
  const [inputValues, setInputValues] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize default values
  useState(() => {
    if (triggerConfig.inputFields) {
      const defaults: Record<string, any> = {};
      triggerConfig.inputFields.forEach((field) => {
        if (field.defaultValue !== undefined) {
          defaults[field.name] = field.defaultValue;
        }
      });
      setInputValues(defaults);
    }
  });

  const handleInputChange = (fieldName: string, value: any) => {
    setInputValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const validateInputs = (): boolean => {
    if (!triggerConfig.inputFields) return true;

    for (const field of triggerConfig.inputFields) {
      if (field.required && !inputValues[field.name]) {
        setError(`${field.label} is required`);
        return false;
      }
    }

    return true;
  };

  const handleExecute = async () => {
    setError(null);

    if (!validateInputs()) {
      return;
    }

    try {
      setExecuting(true);

      const response = await fetch("/api/admin/orchestrations/triggers/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orchestrationId,
          input: inputValues,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to execute orchestration");
      }

      const data = await response.json();
      onSuccess(data.executionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Run Orchestration</h2>
              <p className="text-sm text-slate-600 mt-1">{orchestrationName}</p>
            </div>
            <button
              className="text-slate-500 hover:text-slate-700 transition-colors"
              onClick={onClose}
              type="button"
              disabled={executing}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {!triggerConfig.inputFields || triggerConfig.inputFields.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-600">
                This orchestration has no input fields.
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Click "Run" to start execution immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter the input values to start the orchestration:
              </p>

              {triggerConfig.inputFields.map((field) => (
                <div key={field.name}>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>

                  {field.type === "textarea" ? (
                    <textarea
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={4}
                      value={inputValues[field.name] || ""}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      disabled={executing}
                    />
                  ) : field.type === "select" ? (
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={inputValues[field.name] || ""}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      disabled={executing}
                    >
                      <option value="">-- Select --</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "boolean" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={field.name}
                        className="rounded border-slate-300"
                        checked={inputValues[field.name] || false}
                        onChange={(e) => handleInputChange(field.name, e.target.checked)}
                        disabled={executing}
                      />
                      <label htmlFor={field.name} className="text-sm text-slate-600">
                        {field.description || field.label}
                      </label>
                    </div>
                  ) : (
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={inputValues[field.name] || ""}
                      onChange={(e) =>
                        handleInputChange(
                          field.name,
                          field.type === "number"
                            ? parseFloat(e.target.value) || 0
                            : e.target.value
                        )
                      }
                      placeholder={field.placeholder}
                      disabled={executing}
                    />
                  )}

                  {field.description && (
                    <p className="mt-1 text-xs text-slate-500">{field.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4">
          <div className="flex items-center justify-end gap-3">
            <button
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
              onClick={onClose}
              type="button"
              disabled={executing}
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white font-semibold rounded-lg transition-colors"
              onClick={handleExecute}
              disabled={executing}
              type="button"
            >
              {executing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Orchestration
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
