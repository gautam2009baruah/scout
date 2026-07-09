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
        setMessage({ type: "error", text: data.error || "Failed to load credentials" });
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message });
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
        setMessage({ type: "error", text: data.error || "Failed to add credential" });
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message });
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
          text: `Connection successful! Found ${data.emailsFound} email(s) in inbox.` 
        });
        await loadCredentials();
      } else {
        setMessage({ type: "error", text: data.error || "Connection test failed" });
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message });
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
        setMessage({ type: "error", text: data.error || "Failed to delete credential" });
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setDeletingId(null);
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
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleTestCredential(cred.id)}
                        disabled={testingId === cred.id || deletingId === cred.id}
                        className="text-blue-600 hover:text-blue-800 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        {testingId === cred.id ? "Testing..." : "Test"}
                      </button>
                      <button
                        onClick={() => handleDeleteCredential(cred.id, cred.name)}
                        disabled={testingId === cred.id || deletingId === cred.id}
                        className="text-red-600 hover:text-red-800 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        {deletingId === cred.id ? "Deleting..." : "Delete"}
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
