"use client";

import { useState, useEffect } from "react";

type EmailCredential = {
  id: string;
  provider: "imap" | "gmail" | "outlook";
  name: string;
  email_address: string;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: "success" | "failed" | null;
  last_test_error: string | null;
  created_at: string;
};

type NewCredential = {
  provider: "imap" | "gmail" | "outlook";
  name: string;
  emailAddress: string;
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
  imapTls?: boolean;
};

export function EmailCredentialsManager() {
  const [credentials, setCredentials] = useState<EmailCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCredential, setNewCredential] = useState<NewCredential>({
    provider: "imap",
    name: "",
    emailAddress: "",
    imapHost: "",
    imapPort: 993,
    imapUsername: "",
    imapPassword: "",
    imapTls: true,
  });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCredential, setEditingCredential] = useState<EmailCredential | null>(null);
  const [editForm, setEditForm] = useState<Partial<NewCredential>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    try {
      const response = await fetch("/api/orchestrations/email-credentials");
      const data = await response.json();
      
      if (data.success) {
        setCredentials(data.credentials);
      } else {
        setMessage({ type: "error", text: "Failed to load email credentials. Please try again." });
        console.error("[Email Credentials] Load error:", data.error);
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Unable to connect to server. Please check your connection." });
      console.error("[Email Credentials] Load exception:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCredential() {
    if (!newCredential.name || !newCredential.emailAddress) {
      setMessage({ type: "error", text: "Name and email address are required" });
      return;
    }

    if (newCredential.provider === "imap") {
      if (!newCredential.imapHost || !newCredential.imapUsername || !newCredential.imapPassword) {
        setMessage({ type: "error", text: "IMAP host, username, and password are required" });
        return;
      }
    }

    try {
      const response = await fetch("/api/orchestrations/email-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCredential),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: "Email credential added successfully" });
        setShowAddForm(false);
        setNewCredential({
          provider: "imap",
          name: "",
          emailAddress: "",
          imapHost: "",
          imapPort: 993,
          imapUsername: "",
          imapPassword: "",
          imapTls: true,
        });
        await loadCredentials();
      } else {
        setMessage({ type: "error", text: "Failed to add email credential. Please check your settings." });
        console.error("[Email Credentials] Add error:", data.error);
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Unable to save credential. Please try again." });
      console.error("[Email Credentials] Add exception:", error);
    }
  }

  async function handleTestCredential(credentialId: string) {
    setTestingId(credentialId);
    setMessage(null);

    try {
      const response = await fetch("/api/orchestrations/email-credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ 
          type: "success", 
          text: "Connection successful" 
        });
        await loadCredentials();
      } else {
        setMessage({ type: "error", text: data.error || "Connection test failed. Please verify your settings." });
        console.error("[Email Credentials] Test error:", data.error);
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Unable to test connection. Please try again." });
      console.error("[Email Credentials] Test exception:", error);
    } finally {
      setTestingId(null);
    }
  }

  async function handleDeleteCredential(credentialId: string, credentialName: string) {
    if (!confirm(`Are you sure you want to delete "${credentialName}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(credentialId);
    setMessage(null);

    try {
      const response = await fetch(`/api/orchestrations/email-credentials/${credentialId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: "Email credential deleted successfully" });
        await loadCredentials();
      } else {
        setMessage({ type: "error", text: data.error || "Unable to delete credential. Please try again." });
        console.error("[Email Credentials] Delete error:", data.error);
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Unable to delete credential. Please try again." });
      console.error("[Email Credentials] Delete exception:", error);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleEditClick(cred: EmailCredential) {
    setEditingCredential(cred);
    
    // Fetch full credential details for editing
    try {
      const response = await fetch(`/api/orchestrations/email-credentials/${cred.id}`);
      const data = await response.json();
      
      if (data.success) {
        const fullCred = data.credential;
        setEditForm({
          name: fullCred.name,
          emailAddress: fullCred.email_address,
          provider: fullCred.provider,
          imapHost: fullCred.imap_host || "",
          imapPort: fullCred.imap_port || 993,
          imapUsername: fullCred.imap_username || "",
          imapPassword: "", // Never pre-fill password
          imapTls: fullCred.imap_tls !== false,
        });
      } else {
        setMessage({ type: "error", text: "Unable to load credential details. Please try again." });
        console.error("[Email Credentials] Fetch for edit error:", data.error);
        setEditingCredential(null);
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Unable to load credential details. Please try again." });
      console.error("[Email Credentials] Fetch for edit exception:", error);
      setEditingCredential(null);
    }
  }

  async function handleUpdateCredential() {
    if (!editingCredential) return;

    if (!editForm.name || !editForm.emailAddress) {
      setMessage({ type: "error", text: "Name and email address are required" });
      return;
    }

    try {
      const response = await fetch(`/api/orchestrations/email-credentials/${editingCredential.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: "Email credential updated successfully" });
        setEditingCredential(null);
        setEditForm({});
        await loadCredentials();
      } else {
        setMessage({ type: "error", text: "Failed to update credential. Please check your settings." });
        console.error("[Email Credentials] Update error:", data.error);
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Unable to update credential. Please try again." });
      console.error("[Email Credentials] Update exception:", error);
    }
  }

  if (loading) {
    return <div className="p-6">Loading email credentials...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">
            Manage email accounts for email trigger monitoring
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {showAddForm ? "Cancel" : "+ Add Credential"}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      {/* Edit Credential Modal */}
      {editingCredential && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Edit Email Credential</h3>

            <div className="space-y-4">
              {/* Provider (read-only) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider (cannot be changed)</label>
                <div className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded uppercase font-semibold">
                    {editingCredential.provider}
                  </span>
                  <span className="text-xs text-slate-500 ml-2">
                    To use a different provider, delete this credential and create a new one
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Display Name *</label>
                  <input
                    type="text"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={editForm.name || ""}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={editForm.emailAddress || ""}
                    onChange={(e) => setEditForm({ ...editForm, emailAddress: e.target.value })}
                  />
                </div>
              </div>

              {editingCredential.provider === "imap" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">IMAP Host</label>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-3 py-2"
                        placeholder="imap.gmail.com"
                        value={editForm.imapHost || ""}
                        onChange={(e) => setEditForm({ ...editForm, imapHost: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">IMAP Port</label>
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 px-3 py-2"
                        value={editForm.imapPort || 993}
                        onChange={(e) => setEditForm({ ...editForm, imapPort: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 px-3 py-2"
                      placeholder="Usually same as email address"
                      value={editForm.imapUsername || ""}
                      onChange={(e) => setEditForm({ ...editForm, imapUsername: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      New Password (leave blank to keep existing)
                    </label>
                    <input
                      type="password"
                      className="w-full rounded border border-slate-300 px-3 py-2"
                      placeholder="Enter new password only if changing"
                      value={editForm.imapPassword || ""}
                      onChange={(e) => setEditForm({ ...editForm, imapPassword: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="editImapTls"
                      checked={editForm.imapTls !== false}
                      onChange={(e) => setEditForm({ ...editForm, imapTls: e.target.checked })}
                    />
                    <label htmlFor="editImapTls" className="text-sm text-slate-700">Use TLS/SSL</label>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleUpdateCredential}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Update Credential
              </button>
              <button
                onClick={() => {
                  setEditingCredential(null);
                  setEditForm({});
                }}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Credential Form */}
      {showAddForm && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Add New Email Credential</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
              <select
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={newCredential.provider}
                onChange={(e) => setNewCredential({ ...newCredential, provider: e.target.value as any })}
              >
                <option value="imap">IMAP (Generic)</option>
                <option value="gmail">Gmail (OAuth - Coming Soon)</option>
                <option value="outlook">Outlook (OAuth - Coming Soon)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
              <input
                type="text"
                className="w-full rounded border border-slate-300 px-3 py-2"
                placeholder="e.g., Support Inbox"
                value={newCredential.name}
                onChange={(e) => setNewCredential({ ...newCredential, name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="support@company.com"
              value={newCredential.emailAddress}
              onChange={(e) => setNewCredential({ ...newCredential, emailAddress: e.target.value })}
            />
          </div>

          {newCredential.provider === "imap" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">IMAP Host</label>
                  <input
                    type="text"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    placeholder="imap.gmail.com"
                    value={newCredential.imapHost}
                    onChange={(e) => setNewCredential({ ...newCredential, imapHost: e.target.value })}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Gmail: imap.gmail.com | Outlook: outlook.office365.com
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">IMAP Port</label>
                  <input
                    type="number"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={newCredential.imapPort}
                    onChange={(e) => setNewCredential({ ...newCredential, imapPort: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-slate-500 mt-1">Default: 993 (SSL/TLS)</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  placeholder="Usually same as email address"
                  value={newCredential.imapUsername}
                  onChange={(e) => setNewCredential({ ...newCredential, imapUsername: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  placeholder="App-specific password (for Gmail)"
                  value={newCredential.imapPassword}
                  onChange={(e) => setNewCredential({ ...newCredential, imapPassword: e.target.value })}
                />
                <p className="text-xs text-slate-500 mt-1">
                  For Gmail: Use App Password (2FA required). For Outlook: Use account password.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="imapTls"
                  checked={newCredential.imapTls}
                  onChange={(e) => setNewCredential({ ...newCredential, imapTls: e.target.checked })}
                />
                <label htmlFor="imapTls" className="text-sm text-slate-700">Use TLS/SSL (Recommended)</label>
              </div>
            </>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleAddCredential}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Add Credential
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Credentials List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700 w-16">S.No</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Name</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Email</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Provider</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Status</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Last Test</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {credentials.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                  No email credentials configured yet. Add one to get started.
                </td>
              </tr>
            ) : (
              credentials.map((cred, index) => (
                <tr key={cred.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">{index + 1}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{cred.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{cred.email_address}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded uppercase">
                      {cred.provider}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {cred.is_active ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Active</span>
                    ) : (
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {cred.last_tested_at ? (
                      <div>
                        <div>{new Date(cred.last_tested_at).toLocaleDateString()}</div>
                        {cred.last_test_status && (
                          <div>
                            <span className={`text-xs ${cred.last_test_status === "success" ? "text-green-600" : "text-red-600"}`}>
                              {cred.last_test_status}
                            </span>
                            {cred.last_test_status === "failed" && cred.last_test_error && (
                              <div className="text-xs text-red-600 mt-1 max-w-xs" title={cred.last_test_error}>
                                {cred.last_test_error.length > 50 ? cred.last_test_error.substring(0, 50) + "..." : cred.last_test_error}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">Never tested</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTestCredential(cred.id)}
                        disabled={testingId !== null || deletingId !== null}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded disabled:text-slate-400 disabled:cursor-not-allowed transition"
                        title="Test Connection"
                      >
                        {testingId === cred.id ? (
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleEditClick(cred)}
                        disabled={testingId !== null || deletingId !== null}
                        className="p-2 text-green-600 hover:bg-green-50 rounded disabled:text-slate-400 disabled:cursor-not-allowed transition"
                        title="Edit Credential"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteCredential(cred.id, cred.name)}
                        disabled={testingId !== null || deletingId !== null}
                        className="p-2 text-red-600 hover:bg-red-50 rounded disabled:text-slate-400 disabled:cursor-not-allowed transition"
                        title="Delete Credential"
                      >
                        {deletingId === cred.id ? (
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">ℹ️ Setup Instructions</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li><strong>Gmail:</strong> Enable IMAP in settings, create an App Password (requires 2FA)</li>
          <li><strong>Outlook:</strong> Use your regular password, IMAP must be enabled</li>
          <li><strong>Other providers:</strong> Check your email provider's IMAP settings</li>
          <li>After adding credentials, test the connection to verify it works</li>
          <li>Use these credentials in Email Triggers within orchestrations</li>
        </ul>
      </div>
    </div>
  );
}
