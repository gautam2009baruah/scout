"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { formatVersion } from "./version-history-modal";

type EnvironmentRow = {
  id: string;
  name: string;
  isProduction: boolean;
  releasedVersionMajor: number | null;
  releasedVersionBuild: number | null;
  releasedAt: string | null;
};

type VersionSummary = {
  versionMajor: number;
  versionBuild: number;
  promotedToProduction: boolean;
  createdAt: string;
  changeNotes: string | null;
};

type VersionedEnvironmentReleaseModalProps = {
  // Human-readable name of the item being released (orchestration name,
  // guide title) — shown as the modal subtitle only.
  title: string;
  // e.g. /api/admin/orchestrations/{id}/environments — GET returns
  // { currentVersionMajor, currentVersionBuild, environments, versions },
  // PUT accepts { environmentId, action: "promote" | "revoke", versionMajor?,
  // versionBuild? } (version required for "promote", any past published
  // version — not necessarily the latest) and returns the same shape as GET.
  apiUrl: string;
  onClose: () => void;
  onSaved?: () => void;
  onError?: (message: string) => void;
};

// Encodes a (major, build) pair as a single <select> option value.
function versionKey(versionMajor: number, versionBuild: number) {
  return `${versionMajor}.${versionBuild}`;
}

export function VersionedEnvironmentReleaseModal({ title, apiUrl, onClose, onSaved, onError }: VersionedEnvironmentReleaseModalProps) {
  const [currentVersionMajor, setCurrentVersionMajor] = useState(0);
  const [currentVersionBuild, setCurrentVersionBuild] = useState(0);
  const [environments, setEnvironments] = useState<EnvironmentRow[]>([]);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedVersionByEnvironment, setSelectedVersionByEnvironment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [actioningEnvironmentId, setActioningEnvironmentId] = useState<string | null>(null);
  const [pruneNotice, setPruneNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const response = await fetch(apiUrl);
      const body = await response.json().catch(() => null);

      if (cancelled) {
        return;
      }

      if (!response.ok) {
        onError?.(typeof body?.message === "string" ? body.message : "Unable to load environments.");
        onClose();
        return;
      }

      const loadedVersions: VersionSummary[] = Array.isArray(body?.versions) ? body.versions : [];
      const loadedEnvironments: EnvironmentRow[] = Array.isArray(body?.environments) ? body.environments : [];
      const latest = loadedVersions[0];

      setCurrentVersionMajor(Number(body?.currentVersionMajor) || 0);
      setCurrentVersionBuild(Number(body?.currentVersionBuild) || 0);
      setEnvironments(loadedEnvironments);
      setVersions(loadedVersions);
      setSelectedVersionByEnvironment(
        Object.fromEntries(
          loadedEnvironments.map((env) => [
            env.id,
            env.releasedVersionMajor !== null && env.releasedVersionBuild !== null
              ? versionKey(env.releasedVersionMajor, env.releasedVersionBuild)
              : latest
              ? versionKey(latest.versionMajor, latest.versionBuild)
              : "",
          ])
        )
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  async function runAction(environmentId: string, action: "promote" | "revoke") {
    setActioningEnvironmentId(environmentId);
    setPruneNotice(null);

    const selectedKey = selectedVersionByEnvironment[environmentId] ?? "";
    const [versionMajor, versionBuild] = selectedKey.split(".").map(Number);

    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        environmentId,
        action,
        ...(action === "promote" ? { versionMajor, versionBuild } : {}),
      }),
    });
    const body = await response.json().catch(() => null);
    setActioningEnvironmentId(null);

    if (!response.ok) {
      onError?.(typeof body?.message === "string" ? body.message : "Unable to update environment release.");
      return;
    }

    setCurrentVersionMajor(Number(body?.currentVersionMajor) || 0);
    setCurrentVersionBuild(Number(body?.currentVersionBuild) || 0);
    setEnvironments(Array.isArray(body?.environments) ? body.environments : []);
    setVersions(Array.isArray(body?.versions) ? body.versions : []);

    const prunedVersionsCount = Number(body?.prunedVersionsCount) || 0;
    if (prunedVersionsCount > 0) {
      setPruneNotice(`${prunedVersionsCount} older version${prunedVersionsCount === 1 ? "" : "s"} were cleaned up.`);
    }

    onSaved?.();
  }

  const currentVersionLabel = formatVersion(currentVersionMajor, currentVersionBuild);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
          Publishing alone does not change what a promoted environment sees. Editing and republishing creates a new build under the current major version (currently v{currentVersionLabel}) — each environment keeps running whatever build it was last promoted to. Pick any past published version below, not just the latest, e.g. to roll back. The major version only advances the first time a build is promoted to a production-flagged environment; re-promoting an already-released build elsewhere never bumps it again.
        </p>
        <details className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-700 hover:text-slate-900">
            Older version cleanup
          </summary>
          <p className="mt-2 text-slate-600">
            Promoting a version to a production-flagged environment automatically cleans up old generations: only the promoted major version and the 3 majors before it are kept. Older versions are deleted — except any version still actively released to another environment, which is always kept regardless of age.
          </p>
        </details>
        {pruneNotice && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{pruneNotice}</p>
        )}
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        ) : environments.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No environments are configured for this target app yet. Add one under Company & Role Setup → Manage Environments first.
          </p>
        ) : versions.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This hasn't been published yet — publish it at least once before it can be promoted to an environment.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
            {environments.map((env) => {
              const selectedKey = selectedVersionByEnvironment[env.id] ?? versionKey(versions[0].versionMajor, versions[0].versionBuild);
              const releasedKey = env.releasedVersionMajor !== null && env.releasedVersionBuild !== null
                ? versionKey(env.releasedVersionMajor, env.releasedVersionBuild)
                : null;
              const busy = actioningEnvironmentId === env.id;
              return (
                <div className="flex items-center justify-between gap-3 p-3" key={env.id}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-800">
                      {env.name}
                      {env.isProduction ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Production
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {releasedKey ? `Released: v${releasedKey}${releasedKey === versionKey(currentVersionMajor, currentVersionBuild) ? " (latest)" : ""}` : "Not released"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                      disabled={busy}
                      onChange={(event) => setSelectedVersionByEnvironment((current) => ({ ...current, [env.id]: event.target.value }))}
                      value={selectedKey}
                    >
                      {versions.map((v) => {
                        const key = versionKey(v.versionMajor, v.versionBuild);
                        return (
                          <option key={key} value={key}>
                            v{formatVersion(v.versionMajor, v.versionBuild)}{key === versionKey(currentVersionMajor, currentVersionBuild) ? " (latest)" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={busy || releasedKey === selectedKey}
                      onClick={() => void runAction(env.id, "promote")}
                      type="button"
                    >
                      Promote
                    </button>
                    <button
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={busy || !releasedKey}
                      onClick={() => void runAction(env.id, "revoke")}
                      type="button"
                    >
                      Revoke
                    </button>
                  </div>
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
