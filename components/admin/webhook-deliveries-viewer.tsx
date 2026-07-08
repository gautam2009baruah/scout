/**
 * Webhook Deliveries Viewer Component
 * Shows recent webhook requests and their status
 */

"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

type WebhookDelivery = {
  id: string;
  executionId?: string;
  requestMethod: string;
  requestIp: string;
  statusCode: number;
  processingDurationMs: number;
  signatureValid?: boolean;
  ipAllowed?: boolean;
  filtersMatched?: boolean;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
};

type Props = {
  webhookId: string;
  refreshInterval?: number; // Auto-refresh interval in ms
};

export function WebhookDeliveriesViewer({ webhookId, refreshInterval = 30000 }: Props) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDeliveries = async () => {
    try {
      const response = await fetch(`/api/orchestrations/webhooks/${webhookId}`);
      const data = await response.json();

      if (data.success) {
        setDeliveries(data.deliveries || []);
        setError(null);
      } else {
        setError(data.error || "Failed to load deliveries");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveries();

    if (refreshInterval > 0) {
      const interval = setInterval(loadDeliveries, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [webhookId, refreshInterval]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-semibold">Error loading deliveries</span>
        </div>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="text-center p-8 text-slate-500">
        <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No webhook deliveries yet</p>
        <p className="text-sm mt-1">Requests will appear here when your webhook is called</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Recent Deliveries ({deliveries.length})
        </h3>
        <button
          onClick={loadDeliveries}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {deliveries.map((delivery) => (
          <div
            key={delivery.id}
            className={`border rounded-lg p-3 ${
              delivery.success
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                {delivery.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                )}

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold">
                      {delivery.requestMethod}
                    </span>
                    <span className="text-xs text-slate-500">from {delivery.requestIp}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        delivery.statusCode < 300
                          ? "bg-green-100 text-green-800"
                          : delivery.statusCode < 400
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {delivery.statusCode}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span>{delivery.processingDurationMs}ms</span>
                    <span>
                      {new Date(delivery.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {/* Validation badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {delivery.signatureValid !== undefined && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          delivery.signatureValid
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        Signature: {delivery.signatureValid ? "✓" : "✗"}
                      </span>
                    )}
                    {delivery.ipAllowed !== undefined && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          delivery.ipAllowed
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        IP: {delivery.ipAllowed ? "✓" : "✗"}
                      </span>
                    )}
                    {delivery.filtersMatched !== undefined && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          delivery.filtersMatched
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        Filters: {delivery.filtersMatched ? "✓" : "✗"}
                      </span>
                    )}
                  </div>

                  {delivery.errorMessage && (
                    <div className="text-xs text-red-700 mt-2 p-2 bg-red-100 rounded">
                      {delivery.errorMessage}
                    </div>
                  )}

                  {delivery.executionId && (
                    <div className="text-xs text-blue-700 mt-2">
                      Execution: <span className="font-mono">{delivery.executionId}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
