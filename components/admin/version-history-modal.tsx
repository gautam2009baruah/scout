"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";

type VersionSummary = {
  versionMajor: number;
  versionBuild: number;
  promotedToProduction: boolean;
  createdAt: string;
  changeNotes: string | null;
};

type VersionHistoryModalProps = {
  // Human-readable name of the item (orchestration name, guide title) —
  // shown as the modal subtitle only.
  title: string;
  // e.g. /api/admin/guided-workflows/{id}/versions — GET returns { versions }.
  listApiUrl: string;
  onClose: () => void;
  // Called when the admin picks a version to load. The caller is responsible
  // for fetching that version's full content and applying it to its own
  // editor state — nothing is persisted here, this only lists versions.
  onLoad: (versionMajor: number, versionBuild: number) => Promise<void> | void;
  onError?: (message: string) => void;
};

export function formatVersion(versionMajor: number, versionBuild: number) {
  return `${versionMajor}.${String(versionBuild).padStart(3, "0")}`;
}

export function VersionHistoryModal({ title, listApiUrl, onClose, onLoad, onError }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const response = await fetch(listApiUrl);
      const body = await response.json().catch(() => null);

      if (cancelled) {
        return;
      }

      if (!response.ok) {
        onError?.(typeof body?.message === "string" ? body.message : "Unable to load version history.");
        onClose();
        return;
      }

      setVersions(Array.isArray(body?.versions) ? body.versions : []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listApiUrl]);

  async function handleLoad(versionMajor: number, versionBuild: number) {
    const key = formatVersion(versionMajor, versionBuild);
    setLoadingKey(key);
    try {
      await onLoad(versionMajor, versionBuild);
    } finally {
      setLoadingKey(null);
    }
  }

  const latest = versions[0];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <History className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Version history</h2>
            <p className="truncate text-sm text-slate-500">{title}</p>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Loading a version only pulls it into the editor — nothing changes anywhere else until you save and republish, which creates a new build under the current major version (e.g. 1.003 → 1.004). The major version only advances when a build is promoted to a production environment for the first time.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        ) : versions.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Nothing has been published yet.</p>
        ) : (
          <div className="mt-4 max-h-80 divide-y divide-slate-200 overflow-auto rounded-lg border border-slate-200">
            {versions.map((entry) => {
              const key = formatVersion(entry.versionMajor, entry.versionBuild);
              const isLatest = latest && entry.versionMajor === latest.versionMajor && entry.versionBuild === latest.versionBuild;
              return (
                <div className="flex items-center justify-between gap-3 p-3" key={key}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      v{key}
                      {isLatest ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Latest</span> : null}
                      {entry.promotedToProduction ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Released to production</span> : null}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <button
                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loadingKey !== null}
                    onClick={() => void handleLoad(entry.versionMajor, entry.versionBuild)}
                    type="button"
                  >
                    {loadingKey === key ? "Loading..." : "Load"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
