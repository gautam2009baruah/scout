/**
 * Execution Monitor Component
 * Shows real-time status and logs for orchestration executions
 */

"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw } from "lucide-react";
import type { OrchestrationExecution, OrchestrationNodeExecution } from "@/shared/orchestrationTypes";

interface ExecutionMonitorProps {
  executionId: string;
  orchestrationName: string;
  onClose: () => void;
}

const STATUS_ICONS = {
  pending: <Clock className="h-5 w-5 text-slate-400" />,
  running: <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-5 w-5 text-green-500" />,
  failed: <XCircle className="h-5 w-5 text-red-500" />,
  paused: <AlertCircle className="h-5 w-5 text-yellow-500" />,
  cancelled: <XCircle className="h-5 w-5 text-slate-500" />,
  skipped: <AlertCircle className="h-5 w-5 text-slate-400" />,
};

const STATUS_COLORS = {
  pending: "bg-slate-100 text-slate-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  paused: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-slate-100 text-slate-700",
  skipped: "bg-slate-100 text-slate-500",
};

export function ExecutionMonitor({ executionId, orchestrationName, onClose }: ExecutionMonitorProps) {
  const [execution, setExecution] = useState<OrchestrationExecution | null>(null);
  const [nodeExecutions, setNodeExecutions] = useState<OrchestrationNodeExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchExecutionDetails = async () => {
    try {
      const response = await fetch(`/api/admin/orchestrations/executions/${executionId}`);
      if (response.ok) {
        const data = await response.json();
        setExecution(data.execution);
        setNodeExecutions(data.nodeExecutions || []);
        
        // Stop auto-refresh if execution is not running
        if (data.execution.status !== "running") {
          setAutoRefresh(false);
        }
      }
    } catch (error) {
      console.error("Error fetching execution:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutionDetails();
  }, [executionId]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchExecutionDetails();
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, executionId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg p-6 shadow-xl">
          <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
          <p className="mt-2 text-sm text-slate-600">Loading execution details...</p>
        </div>
      </div>
    );
  }

  if (!execution) {
    return null;
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const formatDuration = () => {
    if (!execution.startedAt) return "Not started";
    const start = new Date(execution.startedAt).getTime();
    const end = execution.completedAt ? new Date(execution.completedAt).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000);
    
    if (duration < 60) return `${duration}s`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Execution Monitor</h2>
              <p className="text-sm text-slate-600 mt-1">{orchestrationName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Status Overview */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">Status</div>
              <div className="flex items-center gap-2">
                {STATUS_ICONS[execution.status]}
                <span className={`text-sm font-semibold px-2 py-0.5 rounded ${STATUS_COLORS[execution.status]}`}>
                  {execution.status.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">Duration</div>
              <div className="text-sm font-semibold text-slate-900">{formatDuration()}</div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">Started</div>
              <div className="text-xs text-slate-700">
                {execution.startedAt ? formatDate(execution.startedAt) : "Not started"}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">Nodes Executed</div>
              <div className="text-sm font-semibold text-slate-900">
                {nodeExecutions.filter(n => n.status === "completed").length} / {nodeExecutions.length}
              </div>
            </div>
          </div>

          {/* Auto-refresh toggle */}
          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="auto-refresh" className="text-sm text-slate-600 cursor-pointer">
              Auto-refresh every 2 seconds
            </label>
            <button
              onClick={fetchExecutionDetails}
              className="ml-auto text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Now
            </button>
          </div>
        </div>

        {/* Node Executions */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Node Execution Log</h3>
          
          {nodeExecutions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Clock className="h-12 w-12 mx-auto mb-2 text-slate-300" />
              <p>No nodes executed yet...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {nodeExecutions.map((nodeExec, index) => (
                <div
                  key={nodeExec.id}
                  className="border border-slate-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-sm font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{nodeExec.nodeLabel}</div>
                        <div className="text-xs text-slate-500">{nodeExec.nodeType}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {STATUS_ICONS[nodeExec.status]}
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${STATUS_COLORS[nodeExec.status]}`}>
                        {nodeExec.status}
                      </span>
                    </div>
                  </div>

                  {nodeExec.startedAt && (
                    <div className="text-xs text-slate-600 mb-2">
                      Started: {formatDate(nodeExec.startedAt)}
                      {nodeExec.completedAt && (
                        <span className="ml-3">
                          Completed: {formatDate(nodeExec.completedAt)}
                        </span>
                      )}
                    </div>
                  )}

                  {nodeExec.errorMessage && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      <strong>Error:</strong> {nodeExec.errorMessage}
                    </div>
                  )}

                  {nodeExec.output && Object.keys(nodeExec.output).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-900">
                        View Output
                      </summary>
                      <pre className="mt-2 p-2 bg-slate-50 rounded text-xs overflow-x-auto">
                        {JSON.stringify(nodeExec.output, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Error message at execution level */}
          {execution.errorMessage && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-sm font-bold text-red-900 mb-2">Execution Error</h4>
              <p className="text-sm text-red-700">{execution.errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
