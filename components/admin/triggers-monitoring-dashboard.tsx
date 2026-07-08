/**
 * Triggers Monitoring Dashboard
 * View all active triggers, their status, and execution history
 */

"use client";

import { useState, useEffect } from "react";
import {
  Play,
  RefreshCw,
  Clock,
  Mail,
  Calendar,
  Zap,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
} from "lucide-react";
import { TRIGGER_TYPES, TRIGGER_TYPE_LABELS, UPCOMING_TRIGGER_TYPES } from "@/shared/orchestrationTypes";

type TriggerStatus = {
  id: string;
  orchestrationId: string;
  orchestrationName: string;
  orchestrationStatus: string;
  triggerType: string;
  isActive: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Schedule-specific
  scheduleNextRun: string | null;
  scheduleLastRun: string | null;
  scheduleExecutionCount: number;
  scheduleErrorCount: number;
  scheduleLastError: string | null;
  // Email-specific
  emailLastCheck: string | null;
  emailLastTriggeredId: string | null;
  emailTotalProcessed: number;
  // Webhook-specific
  webhookUrl: string | null;
  webhookTotalDeliveries: number;
  webhookSuccessfulDeliveries: number;
  webhookFailedDeliveries: number;
  webhookLastTriggered: string | null;
  // Recent history
  recentExecutions: Array<{
    id: string;
    status: string;
    triggeredAt: string;
    executionId: string | null;
    executionStatus: string | null;
    errorMessage: string | null;
  }>;
};

export function TriggersMonitoringDashboard() {
  const [triggers, setTriggers] = useState<TriggerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{
    triggerType: string;
    status: string;
  }>({ triggerType: "all", status: "all" });
  const [testing, setTesting] = useState<string | null>(null);

  const loadTriggers = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.triggerType !== "all") {
        params.append("triggerType", filter.triggerType);
      }
      if (filter.status !== "all") {
        params.append("status", filter.status);
      }

      const response = await fetch(
        `/api/admin/orchestrations/triggers/monitoring?${params.toString()}`
      );
      const data = await response.json();

      if (data.success) {
        setTriggers(data.triggers);
      }
    } catch (error) {
      console.error("Failed to load triggers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTriggers();
    const interval = setInterval(loadTriggers, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [filter]);

  const testTrigger = async (triggerId: string) => {
    setTesting(triggerId);
    try {
      const response = await fetch(
        `/api/admin/orchestrations/triggers/${triggerId}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testPayload: { testMode: true } }),
        }
      );

      const data = await response.json();
      if (data.success) {
        alert(`Test execution started: ${data.executionId}`);
        loadTriggers();
      } else {
        alert(`Test failed: ${data.error}`);
      }
    } catch (error) {
      alert("Test failed: " + error);
    } finally {
      setTesting(null);
    }
  };

  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case "schedule":
        return <Calendar className="h-5 w-5 text-purple-600" />;
      case "email":
        return <Mail className="h-5 w-5 text-pink-600" />;
      case "webhook":
        return <Zap className="h-5 w-5 text-blue-600" />;
      case "manual":
        return <Play className="h-5 w-5 text-green-600" />;
      case "chatbot":
        return <AlertCircle className="h-5 w-5 text-orange-600" />;
      default:
        return <Clock className="h-5 w-5 text-slate-600" />;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getStatusBadge = (isActive: boolean) => {
    return isActive ? (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
        <CheckCircle className="h-3 w-3" />
        Active
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded">
        <XCircle className="h-3 w-3" />
        Inactive
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Triggers Monitoring
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Monitor and manage all orchestration triggers
          </p>
        </div>
        <button
          onClick={loadTriggers}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-4">
          <Filter className="h-5 w-5 text-slate-600" />
          <div className="flex gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700 mr-2">
                Trigger Type:
              </label>
              <select
                className="rounded border border-slate-300 px-3 py-1 text-sm"
                value={filter.triggerType}
                onChange={(e) =>
                  setFilter({ ...filter, triggerType: e.target.value })
                }
              >
                <option value="all">All Types</option>
                {TRIGGER_TYPES.map((type) => {
                  const isUpcoming = UPCOMING_TRIGGER_TYPES.includes(type);
                  return (
                    <option
                      key={type}
                      value={type}
                      disabled={isUpcoming}
                      style={{ textDecoration: isUpcoming ? 'line-through' : 'none', color: isUpcoming ? '#94a3b8' : 'inherit' }}
                    >
                      {TRIGGER_TYPE_LABELS[type]}{isUpcoming ? ' (Coming Soon)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 mr-2">
                Status:
              </label>
              <select
                className="rounded border border-slate-300 px-3 py-1 text-sm"
                value={filter.status}
                onChange={(e) =>
                  setFilter({ ...filter, status: e.target.value })
                }
              >
                <option value="all">All</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Triggers List */}
      <div className="space-y-4">
        {triggers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
            <p className="text-slate-600">No triggers found</p>
          </div>
        ) : (
          triggers.map((trigger) => (
            <div
              key={trigger.id}
              className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              {/* Trigger Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getTriggerIcon(trigger.triggerType)}
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {trigger.orchestrationName}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {trigger.triggerType} trigger • ID: {trigger.id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(trigger.isActive)}
                  <button
                    onClick={() => testTrigger(trigger.id)}
                    disabled={testing === trigger.id || !trigger.isActive}
                    className="flex items-center gap-1 px-3 py-1 text-sm font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="h-3 w-3" />
                    {testing === trigger.id ? "Testing..." : "Test"}
                  </button>
                </div>
              </div>

              {/* Trigger-Specific Stats */}
              <div className="grid grid-cols-4 gap-4 mb-3">
                {trigger.triggerType === "schedule" && (
                  <>
                    <div>
                      <div className="text-xs text-slate-500">Next Run</div>
                      <div className="text-sm font-medium text-slate-900">
                        {formatDateTime(trigger.scheduleNextRun)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Last Run</div>
                      <div className="text-sm font-medium text-slate-900">
                        {formatDateTime(trigger.scheduleLastRun)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Executions</div>
                      <div className="text-sm font-medium text-green-700">
                        {trigger.scheduleExecutionCount || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Errors</div>
                      <div className="text-sm font-medium text-red-700">
                        {trigger.scheduleErrorCount || 0}
                      </div>
                    </div>
                  </>
                )}

                {trigger.triggerType === "email" && (
                  <>
                    <div>
                      <div className="text-xs text-slate-500">Last Check</div>
                      <div className="text-sm font-medium text-slate-900">
                        {formatDateTime(trigger.emailLastCheck)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">
                        Last Triggered
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        {formatDateTime(trigger.lastTriggeredAt)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">
                        Emails Processed
                      </div>
                      <div className="text-sm font-medium text-green-700">
                        {trigger.emailTotalProcessed || 0}
                      </div>
                    </div>
                  </>
                )}

                {trigger.triggerType === "webhook" && (
                  <>
                    <div>
                      <div className="text-xs text-slate-500">
                        Total Deliveries
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        {trigger.webhookTotalDeliveries || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Successful</div>
                      <div className="text-sm font-medium text-green-700">
                        {trigger.webhookSuccessfulDeliveries || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Failed</div>
                      <div className="text-sm font-medium text-red-700">
                        {trigger.webhookFailedDeliveries || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">
                        Last Triggered
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        {formatDateTime(trigger.webhookLastTriggered)}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Webhook URL */}
              {trigger.webhookUrl && (
                <div className="mb-3">
                  <div className="text-xs text-slate-500 mb-1">Webhook URL</div>
                  <div className="font-mono text-xs bg-slate-50 p-2 rounded border border-slate-200 truncate">
                    {trigger.webhookUrl}
                  </div>
                </div>
              )}

              {/* Recent Executions */}
              {trigger.recentExecutions.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    Recent Executions
                  </div>
                  <div className="space-y-1">
                    {trigger.recentExecutions.slice(0, 3).map((exec) => (
                      <div
                        key={exec.id}
                        className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded"
                      >
                        <div className="flex items-center gap-2">
                          {exec.executionStatus === "completed" ? (
                            <CheckCircle className="h-3 w-3 text-green-600" />
                          ) : exec.executionStatus === "failed" ? (
                            <XCircle className="h-3 w-3 text-red-600" />
                          ) : (
                            <Clock className="h-3 w-3 text-slate-400" />
                          )}
                          <span className="text-slate-900">
                            {formatDateTime(exec.triggeredAt)}
                          </span>
                          {exec.executionId && (
                            <span className="text-slate-500">
                              • {exec.executionId}
                            </span>
                          )}
                        </div>
                        {exec.errorMessage && (
                          <span className="text-red-600 text-xs truncate max-w-xs">
                            {exec.errorMessage}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
