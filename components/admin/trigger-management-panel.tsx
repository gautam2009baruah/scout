"use client";

import { useState, useEffect } from "react";
import type { OrchestrationTrigger, WebhookTriggerConfig, APITriggerConfig } from "@/shared/orchestrationTypes";

export default function TriggerManagementPanel({ orchestrationId }: { orchestrationId: string }) {
  const [triggers, setTriggers] = useState<OrchestrationTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateWebhook, setShowCreateWebhook] = useState(false);
  const [showCreateAPI, setShowCreateAPI] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<OrchestrationTrigger | null>(null);

  useEffect(() => {
    fetchTriggers();
  }, [orchestrationId]);

  const fetchTriggers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/orchestrations/triggers?orchestrationId=${orchestrationId}`);
      const data = await response.json();
      setTriggers(data.triggers || []);
    } catch (error) {
      console.error("Failed to fetch triggers:", error);
    } finally {
      setLoading(false);
    }
  };

  const webhookTriggers = triggers.filter((t) => t.triggerType === "webhook");
  const apiTriggers = triggers.filter((t) => t.triggerType === "api");

  return (
    <div className="space-y-6">
      {/* Webhook Triggers Section */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Webhook Triggers</h3>
            <p className="text-sm text-slate-600">Receive HTTP requests from external systems</p>
          </div>
          <button
            onClick={() => setShowCreateWebhook(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + Create Webhook
          </button>
        </div>

        {webhookTriggers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p>No webhook triggers configured</p>
            <p className="text-sm mt-1">Create a webhook to receive HTTP requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhookTriggers.map((trigger) => (
              <WebhookTriggerCard
                key={trigger.id}
                trigger={trigger}
                onSelect={() => setSelectedTrigger(trigger)}
                onRefresh={fetchTriggers}
              />
            ))}
          </div>
        )}
      </div>

      {/* API Triggers Section */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">API Triggers</h3>
            <p className="text-sm text-slate-600">Execute via authenticated REST API</p>
          </div>
          <button
            onClick={() => setShowCreateAPI(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + Create API Trigger
          </button>
        </div>

        {apiTriggers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p>No API triggers configured</p>
            <p className="text-sm mt-1">Create an API trigger for programmatic execution</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiTriggers.map((trigger) => (
              <APITriggerCard
                key={trigger.id}
                trigger={trigger}
                onSelect={() => setSelectedTrigger(trigger)}
                onRefresh={fetchTriggers}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Webhook Dialog */}
      {showCreateWebhook && (
        <CreateWebhookDialog
          orchestrationId={orchestrationId}
          onClose={() => setShowCreateWebhook(false)}
          onSuccess={() => {
            setShowCreateWebhook(false);
            fetchTriggers();
          }}
        />
      )}

      {/* Create API Trigger Dialog */}
      {showCreateAPI && (
        <CreateAPITriggerDialog
          orchestrationId={orchestrationId}
          onClose={() => setShowCreateAPI(false)}
          onSuccess={() => {
            setShowCreateAPI(false);
            fetchTriggers();
          }}
        />
      )}

      {/* Trigger Details Panel */}
      {selectedTrigger && (
        <TriggerDetailsPanel
          trigger={selectedTrigger}
          onClose={() => setSelectedTrigger(null)}
          onRefresh={fetchTriggers}
        />
      )}
    </div>
  );
}

// Webhook Trigger Card Component
function WebhookTriggerCard({
  trigger,
  onSelect,
  onRefresh,
}: {
  trigger: OrchestrationTrigger;
  onSelect: () => void;
  onRefresh: () => void;
}) {
  const config = trigger.config as WebhookTriggerConfig;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${baseUrl}/api/webhooks/${trigger.id}`;

  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-slate-900">{trigger.name}</h4>
            <span className={`px-2 py-0.5 rounded text-xs ${trigger.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
              {trigger.status}
            </span>
          </div>
          {trigger.description && (
            <p className="text-sm text-slate-600 mt-1">{trigger.description}</p>
          )}
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <code className="text-xs bg-slate-100 px-2 py-1 rounded flex-1 font-mono overflow-x-auto">
                {webhookUrl}
              </code>
              <button
                onClick={() => copyToClipboard(webhookUrl)}
                className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 rounded"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex gap-2 text-xs text-slate-600">
              <span>Methods: {config.allowedMethods.join(", ")}</span>
              {config.allowedIPs && config.allowedIPs.length > 0 && (
                <span>• IP Allowlist: {config.allowedIPs.length} IPs</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onSelect}
          className="ml-4 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
        >
          Details
        </button>
      </div>
    </div>
  );
}

// API Trigger Card Component
function APITriggerCard({
  trigger,
  onSelect,
  onRefresh,
}: {
  trigger: OrchestrationTrigger;
  onSelect: () => void;
  onRefresh: () => void;
}) {
  const config = trigger.config as APITriggerConfig;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const apiUrl = `${baseUrl}/api/orchestrations/${trigger.orchestrationId}/execute`;

  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-slate-900">{trigger.name}</h4>
            <span className={`px-2 py-0.5 rounded text-xs ${trigger.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
              {trigger.status}
            </span>
          </div>
          {trigger.description && (
            <p className="text-sm text-slate-600 mt-1">{trigger.description}</p>
          )}
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <code className="text-xs bg-slate-100 px-2 py-1 rounded flex-1 font-mono overflow-x-auto">
                POST {apiUrl}
              </code>
              <button
                onClick={() => copyToClipboard(apiUrl)}
                className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 rounded"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex gap-2 text-xs text-slate-600">
              {config.rateLimit !== undefined && (
                <span>Rate Limit: {config.rateLimit === 0 ? "Unlimited" : `${config.rateLimit}/min`}</span>
              )}
              {config.allowedClients && config.allowedClients.length > 0 && (
                <span>• Allowed Clients: {config.allowedClients.length}</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onSelect}
          className="ml-4 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
        >
          Details
        </button>
      </div>
    </div>
  );
}

// Create Webhook Dialog
function CreateWebhookDialog({
  orchestrationId,
  onClose,
  onSuccess,
}: {
  orchestrationId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowedMethods, setAllowedMethods] = useState<Array<"GET" | "POST" | "PUT">>(["POST"]);
  const [allowedIPs, setAllowedIPs] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const handleCreate = async () => {
    try {
      setCreating(true);

      const config: WebhookTriggerConfig = {
        type: "webhook",
        secret: "", // Will be auto-generated
        allowedMethods,
        allowedIPs: allowedIPs ? allowedIPs.split(",").map((ip) => ip.trim()).filter((ip) => ip) : undefined,
        enabled: true,
      };

      const response = await fetch("/api/admin/orchestrations/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orchestrationId,
          triggerType: "webhook",
          name,
          description,
          config,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setCreatedSecret(data.config.secret);
      } else {
        alert(data.error || "Failed to create webhook");
      }
    } catch (error) {
      console.error("Error creating webhook:", error);
      alert("Failed to create webhook");
    } finally {
      setCreating(false);
    }
  };

  if (createdSecret) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Webhook Created Successfully!</h3>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800 font-semibold">⚠️ Save your webhook secret now!</p>
            <p className="text-sm text-yellow-700 mt-1">
              This secret will not be shown again. You'll need it to authenticate webhook requests.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Webhook Secret
              </label>
              <code className="block bg-slate-100 p-3 rounded font-mono text-sm break-all">
                {createdSecret}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdSecret);
                  alert("Secret copied to clipboard!");
                }}
                className="mt-2 px-3 py-1 text-sm bg-slate-200 hover:bg-slate-300 rounded"
              >
                Copy Secret
              </button>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Example curl command
              </label>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
{`curl -X POST https://your-domain.com/api/webhooks/[trigger-id] \\
  -H "X-Scout-Webhook-Secret: ${createdSecret}" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`}
              </pre>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={() => {
                onSuccess();
                setCreatedSecret(null);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Create Webhook Trigger</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Webhook"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Receives webhooks from external service"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Allowed HTTP Methods</label>
            <div className="flex gap-3">
              {(["GET", "POST", "PUT"] as const).map((method) => (
                <label key={method} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={allowedMethods.includes(method)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAllowedMethods([...allowedMethods, method]);
                      } else {
                        setAllowedMethods(allowedMethods.filter((m) => m !== method));
                      }
                    }}
                    className="mr-2"
                  />
                  {method}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              IP Allowlist (optional)
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={allowedIPs}
              onChange={(e) => setAllowedIPs(e.target.value)}
              placeholder="192.168.1.1, 10.0.0.5"
            />
            <p className="text-xs text-slate-500 mt-1">Comma-separated IP addresses. Leave empty to allow all IPs.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={!name || creating || allowedMethods.length === 0}
          >
            {creating ? "Creating..." : "Create Webhook"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Create API Trigger Dialog  
function CreateAPITriggerDialog({
  orchestrationId,
  onClose,
  onSuccess,
}: {
  orchestrationId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rateLimit, setRateLimit] = useState(60);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    try {
      setCreating(true);

      const config: APITriggerConfig = {
        type: "api",
        rateLimit,
        enabled: true,
      };

      const response = await fetch("/api/admin/orchestrations/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orchestrationId,
          triggerType: "api",
          name,
          description,
          config,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        onSuccess();
      } else {
        alert(data.error || "Failed to create API trigger");
      }
    } catch (error) {
      console.error("Error creating API trigger:", error);
      alert("Failed to create API trigger");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Create API Trigger</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production API"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="API trigger for external systems"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Rate Limit (requests per minute)
            </label>
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={rateLimit}
              onChange={(e) => setRateLimit(parseInt(e.target.value) || 0)}
              min="0"
              placeholder="60"
            />
            <p className="text-xs text-slate-500 mt-1">Set to 0 for unlimited requests</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
          <p className="text-sm text-blue-800">
            📝 Note: You'll need to create API clients with credentials to use this trigger.
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={!name || creating}
          >
            {creating ? "Creating..." : "Create API Trigger"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Trigger Details Panel (placeholder)
function TriggerDetailsPanel({
  trigger,
  onClose,
  onRefresh,
}: {
  trigger: OrchestrationTrigger;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Trigger Details</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Name</label>
            <p className="text-sm text-slate-900">{trigger.name}</p>
          </div>

          {trigger.description && (
            <div>
              <label className="block text-sm font-semibold text-slate-700">Description</label>
              <p className="text-sm text-slate-900">{trigger.description}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700">Status</label>
            <span className={`inline-block px-2 py-0.5 rounded text-xs ${trigger.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
              {trigger.status}
            </span>
          </div>

          {trigger.lastTriggeredAt && (
            <div>
              <label className="block text-sm font-semibold text-slate-700">Last Triggered</label>
              <p className="text-sm text-slate-900">{new Date(trigger.lastTriggeredAt).toLocaleString()}</p>
            </div>
          )}

          {/* Type-specific details */}
          {trigger.triggerType === "webhook" && (
            <WebhookDetailsSection trigger={trigger} onRefresh={onRefresh} />
          )}

          {trigger.triggerType === "api" && (
            <APIDetailsSection trigger={trigger} onRefresh={onRefresh} />
          )}
        </div>
      </div>
    </div>
  );
}

// Webhook-specific details
function WebhookDetailsSection({ trigger, onRefresh }: { trigger: OrchestrationTrigger; onRefresh: () => void }) {
  const config = trigger.config as WebhookTriggerConfig;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${baseUrl}/api/webhooks/${trigger.id}`;

  const handleRotateSecret = async () => {
    if (!confirm("Are you sure you want to rotate the webhook secret? The old secret will stop working immediately.")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/orchestrations/triggers/${trigger.id}/rotate-secret`, {
        method: "POST",
      });
      const data = await response.json();
      
      if (response.ok) {
        alert(`New secret: ${data.secret}\n\nSave this secret - it will not be shown again!`);
        onRefresh();
      } else {
        alert(data.error || "Failed to rotate secret");
      }
    } catch (error) {
      console.error("Error rotating secret:", error);
      alert("Failed to rotate secret");
    }
  };

  const curlCommand = `curl -X POST ${webhookUrl} \\
  -H "X-Scout-Webhook-Secret: YOUR_SECRET_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`;

  return (
    <div className="space-y-4 mt-6">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Webhook URL</label>
        <code className="block bg-slate-100 p-3 rounded font-mono text-sm break-all">
          {webhookUrl}
        </code>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Allowed Methods</label>
        <p className="text-sm text-slate-900">{config.allowedMethods.join(", ")}</p>
      </div>

      {config.allowedIPs && config.allowedIPs.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">IP Allowlist</label>
          <p className="text-sm text-slate-900">{config.allowedIPs.join(", ")}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Example Request</label>
        <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
          {curlCommand}
        </pre>
      </div>

      <div>
        <button
          onClick={handleRotateSecret}
          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
        >
          Rotate Secret
        </button>
      </div>
    </div>
  );
}

// API-specific details
function APIDetailsSection({ trigger, onRefresh }: { trigger: OrchestrationTrigger; onRefresh: () => void }) {
  const config = trigger.config as APITriggerConfig;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const apiUrl = `${baseUrl}/api/orchestrations/${trigger.orchestrationId}/execute`;

  const curlCommand = `curl -X POST ${apiUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "input1": "value1",
    "input2": "value2"
  }'`;

  return (
    <div className="space-y-4 mt-6">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">API Endpoint</label>
        <code className="block bg-slate-100 p-3 rounded font-mono text-sm break-all">
          POST {apiUrl}
        </code>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Rate Limit</label>
        <p className="text-sm text-slate-900">
          {config.rateLimit === 0 ? "Unlimited" : `${config.rateLimit} requests per minute`}
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Example Request</label>
        <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
          {curlCommand}
        </pre>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          📝 To use this API trigger, you need to create an API client with credentials.
          Go to API Clients management to create one.
        </p>
      </div>
    </div>
  );
}
