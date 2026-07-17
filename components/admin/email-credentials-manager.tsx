"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical, Inbox, Mail, Pencil, Power, Send, ShieldCheck, Star, Trash2, X } from "lucide-react";
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
  targetAppIds: string[];
  authenticationMode: "smtp_password" | "oauth2";
  provider: "smtp" | "gmail" | "outlook";
  name: string;
  description: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  isActive: boolean;
  isPrimary: boolean;
};

function IconActionButton({
  label,
  onClick,
  disabled,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  const toneClass = tone === "danger"
    ? "border-red-300 text-red-700 hover:bg-red-50"
    : "border-slate-300 text-slate-700 hover:bg-slate-100";

  return (
    <button
      type="button"
      className={`inline-flex h-8 w-8 items-center justify-center rounded border ${toneClass} disabled:opacity-50`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function EmailCredentialsManager({ selectedCompanyId, selectedCompanyName }: { selectedCompanyId: string; selectedCompanyName?: string }) {
  const [activeTab, setActiveTab] = useState<"inbox" | "sender">("inbox");

  const [credentials, setCredentials] = useState<EmailCredential[]>([]);
  const [senderCredentials, setSenderCredentials] = useState<SenderCredential[]>([]);
  const [targetApps, setTargetApps] = useState<TargetApp[]>([]);

  const [loading, setLoading] = useState(true);
  const [senderLoading, setSenderLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddSenderForm, setShowAddSenderForm] = useState(false);
  const [editingInboxId, setEditingInboxId] = useState<string | null>(null);
  const [editingSenderId, setEditingSenderId] = useState<string | null>(null);

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
    targetAppIds: [],
    authenticationMode: "smtp_password",
    provider: "smtp",
    name: "",
    description: "",
    fromName: "",
    fromEmail: "",
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
  const [senderTestingId, setSenderTestingId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const targetAppOptions = useMemo(
    () => [...targetApps].sort((a, b) => a.name.localeCompare(b.name)),
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
      targetAppIds: [],
      isPrimary: false,
    }));
  }, [loadCredentials, loadSenderCredentials, loadTargetApps, selectedCompanyId]);

  function resetInboxForm() {
    setEditingInboxId(null);
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
  }

  async function handleEditInboxCredential(credentialId: string) {
    try {
      const response = await fetch(`/api/orchestrations/email-credentials/${credentialId}`);
      const data = await response.json() as {
        success?: boolean;
        error?: string;
        credential?: {
          id: string;
          provider: "imap" | "gmail" | "outlook";
          name: string;
          email_address: string;
          imap_host?: string | null;
          imap_port?: number | null;
          imap_tls?: boolean | null;
          target_apps?: Array<{ id: string }>;
        };
      };

      if (!data.success || !data.credential) {
        showToast(data.error || "Unable to load inbox credential for edit.", "error");
        return;
      }

      const credential = data.credential;
      setEditingInboxId(credential.id);
      setShowAddForm(true);
      setNewCredential({
        companyId: selectedCompanyId,
        provider: credential.provider,
        name: credential.name,
        emailAddress: credential.email_address,
        imapHost: credential.imap_host || "",
        imapPort: credential.imap_port || 993,
        imapPassword: "",
        imapTls: credential.imap_tls !== false,
        targetAppIds: Array.isArray(credential.target_apps) ? credential.target_apps.map((item) => item.id) : [],
      });
    } catch (error) {
      console.error("[Email Credentials] Load inbox credential for edit error:", error);
      showToast("Unable to load inbox credential for edit.", "error");
    }
  }

  async function handleSaveInboxCredential() {
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

    if (newCredential.provider === "imap" && !newCredential.imapHost) {
      showToast("IMAP host is required", "error");
      return;
    }

    if (!editingInboxId && newCredential.provider === "imap" && !newCredential.imapPassword) {
      showToast("IMAP password is required", "error");
      return;
    }

    try {
      const response = await fetch(editingInboxId ? `/api/orchestrations/email-credentials/${editingInboxId}` : "/api/orchestrations/email-credentials", {
        method: editingInboxId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingInboxId
          ? {
              name: newCredential.name,
              emailAddress: newCredential.emailAddress,
              imapHost: newCredential.imapHost,
              imapPort: newCredential.imapPort,
              imapPassword: newCredential.imapPassword,
              imapTls: newCredential.imapTls,
              targetAppIds: newCredential.targetAppIds,
            }
          : newCredential),
      });

      const data = await response.json() as { success?: boolean; error?: string };

      if (data.success) {
        showToast(editingInboxId ? "Inbox credential updated successfully" : "Inbox credential added successfully", "success");
        setShowAddForm(false);
        resetInboxForm();
        await loadCredentials();
      } else {
        showToast(data.error || `Failed to ${editingInboxId ? "update" : "add"} inbox credential.`, "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Save inbox credential error:", error);
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

  function resetSenderForm() {
    setEditingSenderId(null);
    setNewSenderCredential((current) => ({
      ...current,
      targetAppIds: [],
      authenticationMode: "smtp_password",
      name: "",
      description: "",
      fromName: "",
      fromEmail: "",
      smtpHost: "",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: "",
      smtpPassword: "",
      isActive: true,
      isPrimary: false,
    }));
  }

  async function handleEditSenderCredential(credentialId: string) {
    try {
      const response = await fetch(`/api/orchestrations/email-sender-credentials/${credentialId}`);
      const data = await response.json() as {
        success?: boolean;
        error?: string;
        credential?: {
          id: string;
          target_app_id: string | null;
          provider: "smtp" | "gmail" | "outlook";
          name: string;
          description: string | null;
          from_name: string | null;
          from_email: string;
          smtp_host: string | null;
          smtp_port: number | null;
          smtp_secure: boolean;
          smtp_username: string | null;
          is_active: boolean;
          is_primary: boolean;
        };
      };

      if (!data.success || !data.credential) {
        showToast(data.error || "Unable to load sender credential for edit.", "error");
        return;
      }

      const credential = data.credential;
      setEditingSenderId(credential.id);
      setShowAddSenderForm(true);
      setNewSenderCredential((current) => ({
        ...current,
        targetAppIds: credential.target_app_id ? [credential.target_app_id] : [],
        authenticationMode: "smtp_password",
        provider: credential.provider,
        name: credential.name,
        description: credential.description || "",
        fromName: credential.from_name || "",
        fromEmail: credential.from_email,
        smtpHost: credential.smtp_host || "",
        smtpPort: credential.smtp_port || 587,
        smtpSecure: credential.smtp_secure,
        smtpUsername: credential.smtp_username || "",
        smtpPassword: "",
        isActive: credential.is_active,
        isPrimary: credential.is_primary,
      }));
    } catch (error) {
      console.error("[Email Credentials] Load sender credential for edit error:", error);
      showToast("Unable to load sender credential for edit.", "error");
    }
  }

  async function handleTestSenderCredential(credentialId: string) {
    setSenderTestingId(credentialId);
    try {
      const response = await fetch(`/api/orchestrations/email-sender-credentials/${credentialId}/test`, {
        method: "POST",
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (data.success) {
        showToast("Sender connection successful.", "success");
      } else {
        showToast(data.error || "Sender connection test failed.", "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Test sender credential error:", error);
      showToast("Unable to test sender credential.", "error");
    } finally {
      setSenderTestingId(null);
    }
  }

  async function handleSaveSenderCredential() {
    if (!newSenderCredential.name.trim() || !newSenderCredential.fromEmail.trim()) {
      showToast("Credential name and From email are required.", "error");
      return;
    }

    if (!Array.isArray(newSenderCredential.targetAppIds) || newSenderCredential.targetAppIds.length === 0) {
      showToast("At least one target application is required.", "error");
      return;
    }

    if (editingSenderId && newSenderCredential.targetAppIds.length !== 1) {
      showToast("Edit mode supports exactly one target application.", "error");
      return;
    }

    const invalidSelection = newSenderCredential.targetAppIds.some((id) => !targetApps.some((app) => app.id === id));
    if (invalidSelection) {
      showToast("Please select valid target applications.", "error");
      return;
    }

    if (newSenderCredential.authenticationMode !== "smtp_password") {
      showToast("Only SMTP password authentication is currently supported.", "error");
      return;
    }

    if (newSenderCredential.provider === "smtp") {
      if (!newSenderCredential.smtpHost.trim() || !newSenderCredential.smtpUsername.trim() || !newSenderCredential.smtpPassword.trim()) {
        showToast("SMTP host, username and password are required.", "error");
        return;
      }
    }

    try {
      const response = await fetch(editingSenderId ? `/api/orchestrations/email-sender-credentials/${editingSenderId}` : "/api/orchestrations/email-sender-credentials", {
        method: editingSenderId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingSenderId ? {
          targetAppId: newSenderCredential.targetAppIds[0],
          provider: newSenderCredential.provider,
          name: newSenderCredential.name,
          description: newSenderCredential.description || null,
          fromName: newSenderCredential.fromName || null,
          fromEmail: newSenderCredential.fromEmail,
          smtpHost: newSenderCredential.smtpHost || null,
          smtpPort: newSenderCredential.smtpPort,
          smtpSecure: newSenderCredential.smtpSecure,
          smtpUsername: newSenderCredential.smtpUsername || null,
          smtpPassword: newSenderCredential.smtpPassword || null,
          isActive: newSenderCredential.isActive,
          isPrimary: newSenderCredential.isPrimary,
        } : {
          companyId: selectedCompanyId,
          targetAppIds: newSenderCredential.targetAppIds,
          provider: newSenderCredential.provider,
          name: newSenderCredential.name,
          description: newSenderCredential.description || null,
          fromName: newSenderCredential.fromName || null,
          fromEmail: newSenderCredential.fromEmail,
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
        showToast(editingSenderId ? "Sender credential updated" : "Sender credential created", "success");
        setShowAddSenderForm(false);
        resetSenderForm();
        await loadSenderCredentials();
      } else {
        showToast(data.error || `Unable to ${editingSenderId ? "update" : "create"} sender credential.`, "error");
      }
    } catch (error) {
      console.error("[Email Credentials] Save sender credential error:", error);
      showToast("Unable to save sender credential.", "error");
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

  function requestToggleSenderActive(credential: SenderCredential) {
    if (!credential.is_active) {
      void handleToggleSenderActive(credential);
      return;
    }

    setConfirmDialog({
      message: `Disable sender credential "${credential.name}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        await handleToggleSenderActive(credential);
      }
    });
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
      <section className="grid gap-0">
        <div className="rounded-t-lg border border-slate-200 border-b-0 bg-white px-4 pt-3">
          <p className="text-xs font-medium text-slate-500">Company scope: {selectedCompanyName || "Selected company"}</p>
          <p className="mt-1 text-xs text-slate-500">Use separate tabs for inbound mailbox monitoring and outbound email delivery identities.</p>

          <div className="mt-2 border-b border-slate-200">
            <div aria-label="Email credential sections" className="flex items-end gap-2" role="tablist">
              <button
                aria-controls="email-inbox-panel"
                aria-selected={activeTab === "inbox"}
                className={`inline-flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "inbox"
                    ? "border-slate-300 bg-white text-slate-900"
                    : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                id="email-inbox-tab"
                onClick={() => setActiveTab("inbox")}
                role="tab"
                type="button"
              >
                <Inbox className="h-4 w-4" />
                Email Trigger Inbox Credentials
              </button>
              <button
                aria-controls="email-sender-panel"
                aria-selected={activeTab === "sender"}
                className={`inline-flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "sender"
                    ? "border-slate-300 bg-white text-slate-900"
                    : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                id="email-sender-tab"
                onClick={() => setActiveTab("sender")}
                role="tab"
                type="button"
              >
                <Send className="h-4 w-4" />
                Outbound Sender Credentials
              </button>
            </div>
          </div>
        </div>

        <div
          aria-labelledby={activeTab === "inbox" ? "email-inbox-tab" : "email-sender-tab"}
          className="rounded-b-lg border border-slate-200 border-t-0 bg-white shadow-sm"
          id={activeTab === "inbox" ? "email-inbox-panel" : "email-sender-panel"}
          role="tabpanel"
        >
          <div className="space-y-6 p-4 md:p-5">
            {activeTab === "inbox" ? (
              <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Inbox credentials for Email Triggers</h3>
              <p className="text-sm text-slate-600">These credentials are used only to read incoming mail for orchestration email triggers.</p>
            </div>
            <button
              onClick={() => {
                if (showAddForm) {
                  setShowAddForm(false);
                  resetInboxForm();
                  return;
                }
                resetInboxForm();
                setShowAddForm(true);
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
            >
              {showAddForm ? "Cancel" : "+ Add Inbox Credential"}
            </button>
          </div>

          {showAddForm ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
              <h4 className="text-lg font-semibold text-slate-900">{editingInboxId ? "Edit Email Trigger Inbox Credential" : "Add Email Trigger Inbox Credential"}</h4>

              <div>
                <MultiSelectDropdown
                  label="Target Applications *"
                  options={targetAppOptions.map((app) => ({ label: app.name, value: app.id }))}
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
                <button onClick={() => { void handleSaveInboxCredential(); }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" type="button">{editingInboxId ? "Update Inbox Credential" : "Add Inbox Credential"}</button>
                <button onClick={() => { setShowAddForm(false); resetInboxForm(); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button">Cancel</button>
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Sno</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Name</th>
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
                    ) : credentials.map((cred, index) => (
                      <tr key={cred.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-700">{index + 1}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{cred.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 uppercase">{cred.provider}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.target_apps?.length ? cred.target_apps.map((app) => app.name).join(", ") : "All apps"}</td>
                        <td className="px-4 py-3 text-sm">{cred.is_active ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span> : <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Inactive</span>}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.last_tested_at ? new Date(cred.last_tested_at).toLocaleString() : "Never tested"}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <IconActionButton
                              label={testingId === cred.id ? "Testing..." : "Test connection"}
                              onClick={() => { void handleTestCredential(cred.id); }}
                              disabled={!cred.is_active || inboxActionsBusy}
                            >
                              <FlaskConical className="h-3.5 w-3.5" />
                            </IconActionButton>
                            <IconActionButton
                              label="Edit inbox credential"
                              onClick={() => { void handleEditInboxCredential(cred.id); }}
                              disabled={inboxActionsBusy}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </IconActionButton>
                            <IconActionButton
                              label={togglingId === cred.id ? "Updating..." : cred.is_active ? "Disable" : "Enable"}
                              onClick={() => handleToggleActive(cred.id, cred.is_active, cred.name)}
                              disabled={inboxActionsBusy}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </IconActionButton>
                            <IconActionButton
                              label={deletingId === cred.id ? "Deleting..." : "Delete inbox credential"}
                              onClick={() => handleDeleteCredential(cred.id, cred.name)}
                              disabled={inboxActionsBusy}
                              tone="danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconActionButton>
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
              onClick={() => {
                if (showAddSenderForm) {
                  setShowAddSenderForm(false);
                  resetSenderForm();
                  return;
                }
                resetSenderForm();
                setShowAddSenderForm(true);
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
            >
              {showAddSenderForm ? "Cancel" : "+ Add Sender Credential"}
            </button>
          </div>

          {showAddSenderForm ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
              <h4 className="text-lg font-semibold text-slate-900">{editingSenderId ? "Edit Outbound Sender Credential" : "Add Outbound Sender Credential"}</h4>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="md:col-span-2 xl:col-span-2">
                  <MultiSelectDropdown
                    label="Target Applications *"
                    options={targetAppOptions.map((app) => ({ label: app.name, value: app.id }))}
                    selectedValues={newSenderCredential.targetAppIds}
                    onChange={(values) => setNewSenderCredential((current) => ({ ...current, targetAppIds: values }))}
                    emptyLabel="Select target applications"
                  />
                </div>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Authentication Mode
                  <select className="h-11 rounded-lg border border-slate-300 px-3" value={newSenderCredential.authenticationMode} onChange={(event) => setNewSenderCredential({ ...newSenderCredential, authenticationMode: event.target.value as "smtp_password" | "oauth2" })}>
                    <option value="smtp_password">SMTP Username/Password</option>
                    <option value="oauth2" disabled>OAuth2 (coming soon)</option>
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
                <button onClick={() => { void handleSaveSenderCredential(); }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" type="button">{editingSenderId ? "Update Sender Credential" : "Add Sender Credential"}</button>
                <button onClick={() => { setShowAddSenderForm(false); resetSenderForm(); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button">Cancel</button>
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Sno</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Target Applications</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">From identity</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">SMTP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {senderCredentials.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No outbound sender credentials configured yet.</td></tr>
                    ) : senderCredentials.map((cred, index) => (
                      <tr key={cred.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-700">{index + 1}</td>
                        <td className="px-4 py-3 text-sm text-slate-900 inline-flex items-center gap-1.5">{cred.name}{cred.is_primary ? <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> : null}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.target_app_name || "Company level"}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.from_name ? `${cred.from_name} <${cred.from_email}>` : cred.from_email}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{cred.smtp_host || "-"}{cred.smtp_port ? `:${cred.smtp_port}` : ""}</td>
                        <td className="px-4 py-3 text-sm">{cred.is_active ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span> : <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Inactive</span>}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <IconActionButton
                              label={senderTestingId === cred.id ? "Testing..." : "Test sender credential"}
                              onClick={() => { void handleTestSenderCredential(cred.id); }}
                              disabled={senderTestingId !== null}
                            >
                              <FlaskConical className="h-3.5 w-3.5" />
                            </IconActionButton>
                            <IconActionButton
                              label="Edit sender credential"
                              onClick={() => { void handleEditSenderCredential(cred.id); }}
                              disabled={senderDeletingId !== null || senderTogglingId !== null || senderPrimaryId !== null}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </IconActionButton>
                            <IconActionButton
                              label={senderPrimaryId === cred.id ? "Setting primary..." : "Set as primary"}
                              onClick={() => { void handleSetSenderPrimary(cred); }}
                              disabled={senderPrimaryId !== null || !cred.is_active || cred.is_primary}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </IconActionButton>
                            <IconActionButton
                              label={senderTogglingId === cred.id ? "Updating..." : cred.is_active ? "Disable" : "Enable"}
                              onClick={() => requestToggleSenderActive(cred)}
                              disabled={senderTogglingId !== null}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </IconActionButton>
                            <IconActionButton
                              label={senderDeletingId === cred.id ? "Deleting..." : "Delete sender credential"}
                              onClick={() => handleDeleteSenderCredential(cred.id, cred.name)}
                              disabled={senderDeletingId !== null}
                              tone="danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconActionButton>
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
          </div>
        </div>
      </section>

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
