"use client";

import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";

type TokenResult = { token: string; scoutBaseUrl: string; expiresAt: string };

// Rendered inside the Add Documents modal when the "Login site" source is
// chosen. Lets the admin download the browser extension and mint a pairing
// token scoped to the folder they're adding documents to.
export function WebIngestorPanel({ folderId, folderName, onDone }: { folderId: string; folderName?: string; onDone?: () => void }) {
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
    <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
        <div>
          <div className="text-sm font-semibold text-slate-900">Capture pages you&apos;re logged into</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            For sites behind a login, a small browser extension captures the pages in your own browser (using your
            existing session) and sends them to
            {folderName ? <span className="font-semibold"> {folderName}</span> : " this folder"}. No site passwords are given to Scout.
          </p>
        </div>
      </div>

      <ol className="space-y-3 text-sm text-slate-700">
        <li>
          <span className="font-semibold">1. Install the extension</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"
              href="/scout-web-ingestor.zip"
              download
            >
              <Download className="h-4 w-4" /> Download extension (.zip)
            </a>
            <span className="text-xs text-slate-500">Unzip, then load it via <em>Developer mode → Load unpacked</em> in your browser.</span>
          </div>
        </li>

        <li>
          <span className="font-semibold">2. Generate a pairing token</span>
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-600">
              Valid for (hours)
              <input
                type="number"
                min={1}
                max={720}
                className="mt-1 h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                value={ttlHours}
                onChange={(event) => setTtlHours(Number(event.target.value) || 24)}
              />
            </label>
            <button
              type="button"
              onClick={generate}
              disabled={loading || !folderId}
              className="h-9 rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60"
            >
              {loading ? "Generating…" : "Generate token"}
            </button>
          </div>
          {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
          {result ? (
            <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Scout URL</span>
                  <button type="button" className="text-xs font-semibold text-violet-700" onClick={() => copy(result.scoutBaseUrl, "url")}>
                    {copied === "url" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="mt-1 block break-all rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-800">{result.scoutBaseUrl}</code>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Pairing token</span>
                  <button type="button" className="text-xs font-semibold text-violet-700" onClick={() => copy(result.token, "token")}>
                    {copied === "token" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="mt-1 block break-all rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-800">{result.token}</code>
              </div>
              <p className="text-[11px] text-slate-500">Expires {new Date(result.expiresAt).toLocaleString()}. Paste both into the extension&apos;s &quot;Scout connection&quot; section.</p>
            </div>
          ) : null}
        </li>

        <li>
          <span className="font-semibold">3. Capture</span>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Log into the target site in another tab, then open the extension and use <em>Crawl site</em> or
            <em> Capture this tab</em>. Pages appear here and are processed automatically.
          </p>
        </li>
      </ol>
      {onDone ? (
        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={onDone} type="button">
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
