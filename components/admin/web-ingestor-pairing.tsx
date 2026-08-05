"use client";

import { useState } from "react";

type FolderOption = { id: string; name: string };

type TokenResult = { token: string; scoutBaseUrl: string; expiresAt: string };

export function WebIngestorPairing({ folders }: { folders: FolderOption[] }) {
  const [folderId, setFolderId] = useState<string>(folders[0]?.id ?? "");
  const [ttlHours, setTtlHours] = useState<number>(24);
  const [result, setResult] = useState<TokenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setResult(null);
    if (!folderId) {
      setError("Select a folder first.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/admin/documents/web-ingestion-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, ttlHours })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.token) {
        setError(payload?.message || "Unable to generate a pairing token.");
        return;
      }
      setResult(payload as TokenResult);
    } catch {
      setError("Unable to generate a pairing token.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Web Ingestor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pull login-protected web pages into a folder using the Scout Web Ingestor browser extension.
          Generate a pairing token below, then paste it into the extension.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="text-xs font-semibold text-slate-600">Target folder</label>
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
          >
            {folders.length === 0 ? <option value="">No folders available</option> : null}
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Token valid for (hours)</label>
          <input
            type="number"
            min={1}
            max={720}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={ttlHours}
            onChange={(event) => setTtlHours(Number(event.target.value) || 24)}
          />
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={loading || folders.length === 0}
          className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate pairing token"}
        </button>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        {result ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Scout URL</span>
                <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => copy(result.scoutBaseUrl, "url")}>
                  {copied === "url" ? "Copied" : "Copy"}
                </button>
              </div>
              <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs text-slate-800">{result.scoutBaseUrl}</code>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Pairing token</span>
                <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => copy(result.token, "token")}>
                  {copied === "token" ? "Copied" : "Copy"}
                </button>
              </div>
              <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs text-slate-800">{result.token}</code>
            </div>
            <p className="text-xs text-slate-500">
              Expires {new Date(result.expiresAt).toLocaleString()}. Paste both values into the extension&apos;s
              &quot;Scout connection&quot; section.
            </p>
          </div>
        ) : null}
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Install the <code>extension-web-ingestor</code> folder via <em>Load unpacked</em> in your browser.</li>
        <li>Generate a token above and paste it (with the Scout URL) into the extension.</li>
        <li>Log into the target site in another tab, then use <em>Crawl site</em> or <em>Capture this tab</em>.</li>
      </ol>
    </div>
  );
}
