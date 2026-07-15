"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Mail, Send, ShieldCheck, Star, X } from "lucide-react";
import { MultiSelectDropdown } from "./multi-select-dropdown";

type TargetApp = {
  id: string;
  name: string;
};

type EmailCredential = {
  id: string;
  company_id: string;
  provider: "imap" | "gmail" | "outlook";
  name: string;
  email_address: string;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: "success" | "failed" | null;
  last_test_error: string | null;
  created_at: string;
  target_apps: TargetApp[];
};

type NewInboxCredential = {
  companyId: string;
  provider: "imap" | "gmail" | "outlook";
  name: string;
  emailAddress: string;
  imapHost?: string;
  imapPort?: number;
  imapPassword?: string;
  imapTls?: boolean;
  targetAppIds: string[];
};

type SenderCredential = {
  id: string;
  company_id: string;
  target_app_id: string | null;
  target_app_name: string | null;
  provider: "smtp" | "gmail" | "outlook";
  name: string;
  description: string | null;
  from_name: string | null;
  from_email: string;
  reply_to_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  smtp_username: string | null;
  is_active: boolean;
  is_primary: boolean;
  updated_at: string;
  created_at: string;
};

type NewSenderCredential = {
  companyId: string;
  scopeTargetAppId: string;
  provider: "smtp" | "gmail" | "outlook";
  name: string;
  description: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  isActive: boolean;
  isPrimary: boolean;
};

const GLOBAL_SCOPE = "__company__";

export function EmailCredentialsManager({ selectedCompanyId, selectedCompanyName }: { selectedCompanyId: string; selectedCompanyName?: string }) {
  const [activeTab, setActiveTab] = useState<"inbox" | "sender">("inbox");

  const [credentials, setCredentials] = useState<EmailCredential[]>([]);
  const [senderCredentials, setSenderCredentials] = useState<SenderCredential[]>([]);
  const [targetApps, setTargetApps] = useState<TargetApp[]>([]);

  const [loading, setLoading] = useState(true);
  const [senderLoading, setSenderLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddSenderForm, setShowAddSenderForm] = useState(false);

  const [newCredential, setNewCredential] = useState<NewInboxCredential>({
    companyId: selectedCompanyId,
    provider: "imap",
    name: "",
    emailAddress: "",
    imapHost: "",
    imapPort: 993,
    imapPassword: "",
    imapTls: true,
    targetAppIds: [],
  });

  const [newSenderCredential, setNewSenderCredential] = useState<NewSenderCredential>({
    companyId: selectedCompanyId,
    scopeTargetAppId: GLOBAL_SCOPE,
    provider: "smtp",
    name: "",
    description: "",
    fromName: "",
    fromEmail: "",
    replyToEmail: "",
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUsername: "",
    smtpPassword: "",
    isActive: true,
    isPrimary: false,
  });

  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [senderDeletingId, setSenderDeletingId] = useState<string | null>(null);
  const [senderTogglingId, setSenderTogglingId] = useState<string | null>(null);
  const [senderPrimaryId, setSenderPrimaryId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const scopeOptions = useMemo(
    () => [{ id: GLOBAL_SCOPE, name: "Company level (default fallback)" }, ...targetApps],
    [targetApps]
  );

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const loadTargetApps = useCallback(async (companyId: string) => {
    try {
      const response = await fetch(`/api/orchestrations/target-apps?companyId=${companyId}`);
      const data = await response.json() as { success?: boolean; targetApps?: TargetApp[]; error?: string };

      if (data.success && Array.isArray(data.targetApps)) {
        setTargetApps(data.targetApps);
      } else {
        console.error("[Email Credentials] Load target apps error:", data.error);
      }
    } catch (error) {
      console.error("[Email Credentials] Load target apps exception:", error);
    }
  }, []);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/orchestrations/email-credentials?companyId=${selectedCompanyId}`);
      const data = await response.json() as { success?: boolean; credentials?: EmailCredential[]; error?: string };

      if (data.success && Array.isArray(data.credentials)) {
        setCredentials(data.credentials);
      } else {
        showToast("Failed to load inbox credentials. Please try again.", "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Load inbox credentials error:", error);
      showToast("Unable to connect to server. Please check your connection.", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, showToast]);

  const loadSenderCredentials = useCallback(async () => {
    setSenderLoading(true);
    try {
      const response = await fetch(`/api/orchestrations/email-sender-credentials?companyId=${selectedCompanyId}`);
      const data = await response.json() as { success?: boolean; credentials?: SenderCredential[]; error?: string };

      if (data.success && Array.isArray(data.credentials)) {
        setSenderCredentials(data.credentials);
      } else {
        showToast("Failed to load sender credentials.", "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Load sender credentials error:", error);
      showToast("Unable to load sender credentials.", "error");
    } finally {
      setSenderLoading(false);
    }
  }, [selectedCompanyId, showToast]);

  useEffect(() => {
    void loadTargetApps(selectedCompanyId);
    void loadCredentials();
    void loadSenderCredentials();

    setNewCredential((current) => ({ ...current, companyId: selectedCompanyId, targetAppIds: [] }));
    setNewSenderCredential((current) => ({
      ...current,
      companyId: selectedCompanyId,
      scopeTargetAppId: GLOBAL_SCOPE,
      isPrimary: false,
    }));
  }, [loadCredentials, loadSenderCredentials, loadTargetApps, selectedCompanyId]);

  async function handleAddCredential() {
    if (!selectedCompanyId) {
      showToast("Selected company is required", "error");
      return;
    }

    if (!newCredential.targetAppIds || newCredential.targetAppIds.length === 0) {
      showToast("At least one target application is required", "error");
      return;
    }

    if (!newCredential.name || !newCredential.emailAddress) {
      showToast("Name and email address are required", "error");
      return;
    }

    if (newCredential.provider === "imap" && (!newCredential.imapHost || !newCredential.imapPassword)) {
      showToast("IMAP host and password are required", "error");
      return;
    }

    try {
      const response = await fetch("/api/orchestrations/email-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCredential),
      });

      const data = await response.json() as { success?: boolean; error?: string };

      if (data.success) {
        showToast("Inbox credential added successfully", "success");
        setShowAddForm(false);
        setNewCredential({
          companyId: selectedCompanyId,
          provider: "imap",
          name: "",
          emailAddress: "",
          imapHost: "",
          imapPort: 993,
          imapPassword: "",
          imapTls: true,
          targetAppIds: [],
        });
        await loadCredentials();
      } else {
        showToast(data.error || "Failed to add inbox credential.", "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Add inbox credential error:", error);
      showToast("Unable to save inbox credential. Please try again.", "error");
    }
  }

  async function handleTestCredential(credentialId: string) {
    setTestingId(credentialId);
    try {
      const response = await fetch("/api/orchestrations/email-credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });

      const data = await response.json() as { success?: boolean; error?: string };
      if (data.success) {
        showToast("Connection successful", "success");
        await loadCredentials();
      } else {
        showToast(data.error || "Connection test failed.", "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Test inbox credential error:", error);
      showToast("Unable to test connection. Please try again.", "error");
    } finally {
      setTestingId(null);
    }
  }

  function handleDeleteCredential(credentialId: string, credentialName: string) {
    setConfirmDialog({
      message: `Delete inbox credential \"${credentialName}\"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setDeletingId(credentialId);
        try {
          const response = await fetch(`/api/orchestrations/email-credentials/${credentialId}`, { method: "DELETE" });
          const data = await response.json() as { success?: boolean; error?: string };
          if (data.success) {
            showToast("Inbox credential deleted", "success");
            await loadCredentials();
          } else {
            showToast(data.error || "Unable to delete inbox credential.", "error");
          }
        } catch (error) {
          console.error("[Email Credentials] Delete inbox credential error:", error);
          showToast("Unable to delete inbox credential.", "error");
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  function handleToggleActive(credentialId: string, currentStatus: boolean, credentialName: string) {
    const action = currentStatus ? "disable" : "enable";
    setConfirmDialog({
      message: `Are you sure you want to ${action} inbox credential \"${credentialName}\"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setTogglingId(credentialId);
        try {
          const response = await fetch(`/api/orchestrations/email-credentials/${credentialId}/toggle`, { method: "PATCH" });
          const data = await response.json() as { success?: boolean; error?: string };
          if (data.success) {
            showToast(`Inbox credential ${action}d`, "success");
            await loadCredentials();
          } else {
            showToast(data.error || `Unable to ${action} inbox credential.`, "error");
          }
        } catch (error) {
          console.error("[Email Credentials] Toggle inbox credential error:", error);
          showToast(`Unable to ${action} inbox credential.`, "error");
        } finally {
          setTogglingId(null);
        }
      },
    });
  }

  async function handleAddSenderCredential() {
    if (!newSenderCredential.name.trim() || !newSenderCredential.fromEmail.trim()) {
      showToast("Credential name and From email are required.", "error");
      return;
    }

    if (newSenderCredential.scopeTargetAppId !== GLOBAL_SCOPE && !targetApps.some((app) => app.id === newSenderCredential.scopeTargetAppId)) {
      showToast("Please select a valid target app scope.", "error");
      return;
    }

    if (newSenderCredential.provider === "smtp") {
      if (!newSenderCredential.smtpHost.trim() || !newSenderCredential.smtpUsername.trim() || !newSenderCredential.smtpPassword.trim()) {
        showToast("SMTP host, username and password are required.", "error");
        return;
      }
    }

    try {
      const response = await fetch("/api/orchestrations/email-sender-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          targetAppId: newSenderCredential.scopeTargetAppId === GLOBAL_SCOPE ? null : newSenderCredential.scopeTargetAppId,
          provider: newSenderCredential.provider,
          name: newSenderCredential.name,
          description: newSenderCredential.description || null,
          fromName: newSenderCredential.fromName || null,
          fromEmail: newSenderCredential.fromEmail,
          replyToEmail: newSenderCredential.replyToEmail || null,
          smtpHost: newSenderCredential.smtpHost || null,
          smtpPort: newSenderCredential.smtpPort,
          smtpSecure: newSenderCredential.smtpSecure,
          smtpUsername: newSenderCredential.smtpUsername || null,
          smtpPassword: newSenderCredential.smtpPassword || null,
          isActive: newSenderCredential.isActive,
          isPrimary: newSenderCredential.isPrimary,
        }),
      });

      const data = await response.json() as { success?: boolean; error?: string };
      if (data.success) {
        showToast("Sender credential created", "success");
        setShowAddSenderForm(false);
        setNewSenderCredential((current) => ({
          ...current,
          scopeTargetAppId: GLOBAL_SCOPE,
          name: "",
          description: "",
          fromName: "",
          fromEmail: "",
          replyToEmail: "",
          smtpHost: "",
          smtpPort: 587,
          smtpSecure: false,
          smtpUsername: "",
          smtpPassword: "",
          isActive: true,
          isPrimary: false,
        }));
        await loadSenderCredentials();
      } else {
        showToast(data.error || "Unable to create sender credential.", "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Add sender credential error:", error);
      showToast("Unable to create sender credential.", "error");
    }
  }

  function handleDeleteSenderCredential(credentialId: string, credentialName: string) {
    setConfirmDialog({
      message: `Delete sender credential \"${credentialName}\"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setSenderDeletingId(credentialId);
        try {
          const response = await fetch(`/api/orchestrations/email-sender-credentials/${credentialId}`, { method: "DELETE" });
          const data = await response.json() as { success?: boolean; error?: string };
          if (data.success) {
            showToast("Sender credential deleted", "success");
            await loadSenderCredentials();
          } else {
            showToast(data.error || "Unable to delete sender credential.", "error");
          }
        } catch (error) {
          console.error("[Email Credentials] Delete sender credential error:", error);
          showToast("Unable to delete sender credential.", "error");
        } finally {
          setSenderDeletingId(null);
        }
      }
    });
  }

  async function handleToggleSenderActive(credential: SenderCredential) {
    setSenderTogglingId(credential.id);
    try {
      const response = await fetch(`/api/orchestrations/email-sender-credentials/${credential.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !credential.is_active, isPrimary: credential.is_primary && !credential.is_active ? true : credential.is_primary }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (data.success) {
        showToast(`Sender credential ${credential.is_active ? "disabled" : "enabled"}`, "success");
        await loadSenderCredentials();
      } else {
        showToast(data.error || "Unable to update sender credential.", "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Toggle sender credential error:", error);
      showToast("Unable to update sender credential.", "error");
    } finally {
      setSenderTogglingId(null);
    }
  }

  async function handleSetSenderPrimary(credential: SenderCredential) {
    setSenderPrimaryId(credential.id);
    try {
      const response = await fetch(`/api/orchestrations/email-sender-credentials/${credential.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true, isActive: true }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (data.success) {
        showToast("Primary sender credential updated", "success");
        await loadSenderCredentials();
      } else {
        showToast(data.error || "Unable to set primary sender.", "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Set primary sender credential error:", error);
      showToast("Unable to set primary sender.", "error");
    } finally {
      setSenderPrimaryId(null);
    }
  }

  const inboxActionsBusy = testingId !== null || deletingId !== null || togglingId !== null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">Company scope: <span className="font-semibold text-slate-800">{selectedCompanyName || "Selected company"}</span></p>
            <p className="mt-1 text-xs text-slate-500">Use separate tabs for inbound mailbox monitoring and outbound email delivery identities.</p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("inbox")}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${activeTab === "inbox" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              <Inbox className="h-4 w-4" />
              Email Trigger Inbox Credentials
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sender")}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${activeTab === "sender" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              <Send className="h-4 w-4" />
              Outbound Sender Credentials
            </button>
          </div>
        </div>
      </div>

      {activeTab === "inbox" ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Inbox credentials for Email Triggers</h3>
              <p className="text-sm text-slate-600">These credentials are used only to read incoming mail for orchestration email triggers.</p>
            </div>
            <button
              onClick={() => setShowAddForm((current) => !current)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
            >
              {showAddForm ? "Cancel" : "+ Add Inbox Credential"}
            </button>
          </div>

          {showAddForm ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
              <h4 className="text-lg font-semibold text-slate-900">Add Email Trigger Inbox Credential</h4>

              <div>
                <MultiSelectDropdown
                  label="Target Applications *"
                  options={targetApps.map((app) => ({ label: app.name, value: app.id }))}
                  selectedValues={newCredential.targetAppIds}
                  onChange={(values) => setNewCredential({ ...newCredential, targetAppIds: values })}
                  emptyLabel="Select target applications"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Provider
                  <select className="h-11 rounded-lg border border-slate-300 px-3" value={newCredential.provider} onChange={(event) => setNewCredential({ ...newCredential, provider: event.target.value as "imap" })}>
                    <option value="imap">IMAP</option>
                    <option value="gmail" disabled>Gmail OAuth (coming soon)</option>
                    <option value="outlook" disabled>Outlook OAuth (coming soon)</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Display name *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" value={newCredential.name} onChange={(event) => setNewCredential({ ...newCredential, name: event.target.value })} placeholder="Support Inbox" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Email address *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" type="email" value={newCredential.emailAddress} onChange={(event) => setNewCredential({ ...newCredential, emailAddress: event.target.value })} placeholder="support@company.com" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  IMAP host *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" value={newCredential.imapHost || ""} onChange={(event) => setNewCredential({ ...newCredential, imapHost: event.target.value })} placeholder="imap.gmail.com" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Port
                  <input className="h-11 rounded-lg border border-slate-300 px-3" type="number" value={newCredential.imapPort || 993} onChange={(event) => setNewCredential({ ...newCredential, imapPort: Number(event.target.value) })} />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Password *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" type="password" value={newCredential.imapPassword || ""} onChange={(event) => setNewCredential({ ...newCredential, imapPassword: event.target.value })} placeholder="App password" />
                </label>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={newCredential.imapTls !== false} onChange={(event) => setNewCredential({ ...newCredential, imapTls: event.target.checked })} />
                Use TLS/SSL
              </label>

              <div className="flex gap-3">
                <button onClick={() => { void handleAddCredential(); }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" type="button">Add Inbox Credential</button>
                <button onClick={() => setShowAddForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button">Cancel</button>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {loading ? (
              <div className="p-6 text-sm text-slate-500">Loading inbox credentials...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Provider</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Target apps</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Last test</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {credentials.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No inbox credentials configured yet.</td></tr>
                    ) : credentials.map((cred) => (
                      <tr key={cred.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900">{cred.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.email_address}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 uppercase">{cred.provider}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.target_apps?.length ? cred.target_apps.map((app) => app.name).join(", ") : "All apps"}</td>
                        <td className="px-4 py-3 text-sm">{cred.is_active ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span> : <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Inactive</span>}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.last_tested_at ? new Date(cred.last_tested_at).toLocaleString() : "Never tested"}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              onClick={() => { void handleTestCredential(cred.id); }}
                              disabled={!cred.is_active || inboxActionsBusy}
                            >
                              {testingId === cred.id ? "Testing..." : "Test"}
                            </button>
                            <button
                              type="button"
                              className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              onClick={() => handleToggleActive(cred.id, cred.is_active, cred.name)}
                              disabled={inboxActionsBusy}
                            >
                              {togglingId === cred.id ? "..." : cred.is_active ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              onClick={() => handleDeleteCredential(cred.id, cred.name)}
                              disabled={inboxActionsBusy}
                            >
                              {deletingId === cred.id ? "..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="font-semibold text-blue-900">What these inbox credentials are used for</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-800">
              <li>Used by Email Triggers to read incoming emails and start orchestrations.</li>
              <li>Not used for sending outbound emails.</li>
              <li>You can scope one inbox credential to multiple target apps for trigger polling.</li>
              <li>After setup, always run Test to verify mailbox connectivity.</li>
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Outbound sender credentials</h3>
              <p className="text-sm text-slate-600">These credentials are for sending emails from autonomous processes and workflow actions.</p>
            </div>
            <button
              onClick={() => setShowAddSenderForm((current) => !current)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
            >
              {showAddSenderForm ? "Cancel" : "+ Add Sender Credential"}
            </button>
          </div>

          {showAddSenderForm ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
              <h4 className="text-lg font-semibold text-slate-900">Add Outbound Sender Credential</h4>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Scope
                  <select className="h-11 rounded-lg border border-slate-300 px-3" value={newSenderCredential.scopeTargetAppId} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, scopeTargetAppId: event.target.value })}>
                    {scopeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Provider
                  <select className="h-11 rounded-lg border border-slate-300 px-3" value={newSenderCredential.provider} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, provider: event.target.value as "smtp" })}>
                    <option value="smtp">SMTP</option>
                    <option value="gmail" disabled>Gmail OAuth (coming soon)</option>
                    <option value="outlook" disabled>Outlook OAuth (coming soon)</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Credential name *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" value={newSenderCredential.name} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, name: event.target.value })} placeholder="Default Sender" />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  From name
                  <input className="h-11 rounded-lg border border-slate-300 px-3" value={newSenderCredential.fromName} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, fromName: event.target.value })} placeholder="Operations Team" />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  From email *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" type="email" value={newSenderCredential.fromEmail} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, fromEmail: event.target.value })} placeholder="noreply@company.com" />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Reply-to email
                  <input className="h-11 rounded-lg border border-slate-300 px-3" type="email" value={newSenderCredential.replyToEmail} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, replyToEmail: event.target.value })} placeholder="support@company.com" />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  SMTP host *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" value={newSenderCredential.smtpHost} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, smtpHost: event.target.value })} placeholder="smtp.office365.com" />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  SMTP port
                  <input className="h-11 rounded-lg border border-slate-300 px-3" type="number" value={newSenderCredential.smtpPort} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, smtpPort: Number(event.target.value) })} />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  SMTP username *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" value={newSenderCredential.smtpUsername} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, smtpUsername: event.target.value })} placeholder="smtp-user" />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  SMTP password *
                  <input className="h-11 rounded-lg border border-slate-300 px-3" type="password" value={newSenderCredential.smtpPassword} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, smtpPassword: event.target.value })} placeholder="SMTP password" />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-2">
                  Description
                  <input className="h-11 rounded-lg border border-slate-300 px-3" value={newSenderCredential.description} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, description: event.target.value })} placeholder="Used by workflow notifications and autonomous email actions" />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={newSenderCredential.smtpSecure} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, smtpSecure: event.target.checked })} />
                  Use secure SMTP/TLS
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={newSenderCredential.isActive} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, isActive: event.target.checked })} />
                  Active on create
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={newSenderCredential.isPrimary} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, isPrimary: event.target.checked })} />
                  Make primary for selected scope
                </label>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { void handleAddSenderCredential(); }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" type="button">Add Sender Credential</button>
                <button onClick={() => setShowAddSenderForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button">Cancel</button>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {senderLoading ? (
              <div className="p-6 text-sm text-slate-500">Loading sender credentials...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Scope</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">From identity</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">SMTP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Primary</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {senderCredentials.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No outbound sender credentials configured yet.</td></tr>
                    ) : senderCredentials.map((cred) => (
                      <tr key={cred.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900">{cred.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.target_app_name || "Company level"}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.from_name ? `${cred.from_name} <${cred.from_email}>` : cred.from_email}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.smtp_host || "-"}{cred.smtp_port ? `:${cred.smtp_port}` : ""}</td>
                        <td className="px-4 py-3 text-sm">{cred.is_active ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span> : <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Inactive</span>}</td>
                        <td className="px-4 py-3 text-sm">{cred.is_primary ? <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-amber-800"><ShieldCheck className="h-3 w-3" />Primary</span> : <span className="text-slate-400">No</span>}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { void handleSetSenderPrimary(cred); }}
                              disabled={senderPrimaryId !== null || !cred.is_active || cred.is_primary}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              title="Set as primary for this scope"
                            >
                              <Star className="h-3.5 w-3.5" />
                              {senderPrimaryId === cred.id ? "..." : "Primary"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleToggleSenderActive(cred); }}
                              disabled={senderTogglingId !== null}
                              className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {senderTogglingId === cred.id ? "..." : cred.is_active ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSenderCredential(cred.id, cred.name)}
                              disabled={senderDeletingId !== null}
                              className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {senderDeletingId === cred.id ? "..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <h4 className="font-semibold text-indigo-900">What these sender credentials are used for</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-indigo-800">
              <li>Used for outbound emails sent by automated processes, notifications, and future autonomous actions.</li>
              <li>Target-app scoped credential overrides company-level credential for that app.</li>
              <li>Mark one primary credential per scope so autonomous processes can resolve defaults automatically.</li>
              <li>This tab provisions sender identities and SMTP details; execution wiring can consume these scoped defaults.</li>
            </ul>
            <p className="mt-2 text-xs text-indigo-700 inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Scope precedence: Target app primary &gt; Company primary.</p>
          </div>
        </>
      )}

      {toast ? (
        <div className="fixed top-4 left-1/2 z-[9999] -translate-x-1/2">
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
            <span className="text-sm font-semibold">{toast.type === "success" ? "Success" : "Error"}</span>
            <span className="text-sm">{toast.message}</span>
            <button onClick={() => setToast(null)} className="rounded p-0.5 hover:bg-black/5" type="button"><X className="h-4 w-4" /></button>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <p className="mb-6 text-sm text-slate-900">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDialog(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" type="button">Cancel</button>
              <button onClick={confirmDialog.onConfirm} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" type="button">Confirm</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
