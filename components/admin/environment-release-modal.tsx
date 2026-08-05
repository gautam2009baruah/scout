"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { MultiSelectDropdown } from "./multi-select-dropdown";

type EnvironmentReleaseModalProps = {
  // Human-readable name of the item being released (orchestration name,
  // guide title, folder name) — shown as the modal subtitle only.
  title: string;
  // e.g. /api/admin/orchestrations/{id}/environments — GET returns
  // { environments, releasedEnvironmentIds }, PUT accepts
  // { environmentIds } and returns { releasedEnvironmentIds }.
  apiUrl: string;
  // Only required for folders, which (unlike orchestrations/guides) can be
  // scoped to multiple target apps at once (or none, i.e. global) — this
  // picks which target app's environment list is being viewed/edited. Sent
  // as a GET query param and PUT body field.
  targetAppId?: string;
  // When there's more than one target app a folder's releases could apply to
  // (a folder assigned to several target apps, or a global folder that can
  // be released per any of the company's target apps), pass every option
  // here and the modal shows a picker instead of a single fixed target app.
  // The first option is selected by default.
  targetAppOptions?: Array<{ id: string; name: string }>;
  // Bulk mode: apply the same chosen environment set to every url here
  // instead of a single apiUrl (e.g. one per selected document). apiUrl is
  // still used for the GET — only to list the target app's environments, its
  // releasedEnvironmentIds is ignored since there's no single "current
  // state" across multiple items; the picker starts blank and Save sets an
  // identical, explicit release set on every item in bulkSaveUrls.
  bulkSaveUrls?: string[];
  onClose: () => void;
  onSaved?: () => void;
  onError?: (message: string) => void;
};

export function EnvironmentReleaseModal({ title, apiUrl, targetAppId, targetAppOptions, bulkSaveUrls, onClose, onSaved, onError }: EnvironmentReleaseModalProps) {
  const [selectedTargetAppId, setSelectedTargetAppId] = useState(targetAppId ?? targetAppOptions?.[0]?.id ?? "");
  const [environments, setEnvironments] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const getUrl = selectedTargetAppId ? `${apiUrl}?targetAppId=${encodeURIComponent(selectedTargetAppId)}` : apiUrl;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const response = await fetch(getUrl);
      const body = await response.json().catch(() => null);

      if (cancelled) {
        return;
      }

      if (!response.ok) {
        onError?.(typeof body?.message === "string" ? body.message : "Unable to load environments.");
        onClose();
        return;
      }

      setEnvironments(Array.isArray(body.environments) ? body.environments : []);
      setSelectedIds(bulkSaveUrls ? [] : Array.isArray(body.releasedEnvironmentIds) ? body.releasedEnvironmentIds : []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getUrl]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const targets = bulkSaveUrls ?? [apiUrl];
    const responses = await Promise.all(
      targets.map((url) =>
        fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environmentIds: selectedIds, targetAppId: selectedTargetAppId }),
        })
      )
    );
    setSaving(false);

    const failureCount = responses.filter((response) => !response.ok).length;
    if (failureCount > 0) {
      onError?.(
        targets.length === 1
          ? "Unable to save environment releases."
          : `Unable to update ${failureCount} of ${targets.length} documents.`
      );
      if (failureCount === targets.length) {
        return;
      }
    }

    onSaved?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={onClose}>
      <form className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={handleSave}>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Globe2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Environments</h2>
            <p className="truncate text-sm text-slate-500">{title}</p>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Publishing alone does not make this available to chat users. Select which environments it is released to — an environment left unchecked is never eligible on the live chat path, regardless of publish status.
        </p>
        {bulkSaveUrls && bulkSaveUrls.length > 1 ? (
          <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
            Applies to all {bulkSaveUrls.length} selected documents — each one's release state for this target app is set to exactly what you choose below, replacing its own current selection.
          </p>
        ) : null}
        {targetAppOptions && targetAppOptions.length > 1 ? (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Target app</span>
            <select
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
              onChange={(event) => setSelectedTargetAppId(event.target.value)}
              value={selectedTargetAppId}
            >
              {targetAppOptions.map((app) => (
                <option key={app.id} value={app.id}>{app.name}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Environments belong to a target app — release this folder separately for each target app it should be available on.
            </span>
          </label>
        ) : null}
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        ) : environments.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No environments are configured for this target app yet. Add one under Chatbot Settings → Manage Environments first.
          </p>
        ) : (
          <div className="mt-4">
            <MultiSelectDropdown
              emptyLabel="Not released to any environment"
              label="Released environments"
              onChange={setSelectedIds}
              options={environments.map((environment) => ({ label: environment.name, value: environment.id }))}
              selectedValues={selectedIds}
            />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={onClose} type="button">Cancel</button>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={loading || saving} type="submit">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
