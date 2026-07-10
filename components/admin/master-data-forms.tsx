"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { HierarchicalModuleSelector } from "./hierarchical-module-selector";
import type { AdminModule } from "@/lib/admin/permissions";
import type { CompanySummary } from "@/lib/admin/administration";

type FormState = {
  message: string;
  status: "idle" | "submitting" | "success" | "error";
};

type MasterDataFormsProps = {
  companies: CompanySummary[];
  modules: AdminModule[];
  currentCompanyId: string;
};

type CompanyTargetApplication = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  baseUrl: string;
};

const initialState: FormState = {
  message: "",
  status: "idle"
};

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function MasterDataForms({ companies, modules, currentCompanyId }: MasterDataFormsProps) {
  const router = useRouter();
  const [companyState, setCompanyState] = useState<FormState>(initialState);
  const [roleState, setRoleState] = useState<FormState>(initialState);
  const [selectedRoleModuleKeys, setSelectedRoleModuleKeys] = useState<string[]>([]);
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [companyTimeout, setCompanyTimeout] = useState<NodeJS.Timeout | null>(null);
  const [roleTimeout, setRoleTimeout] = useState<NodeJS.Timeout | null>(null);
  const [showTargetAppModal, setShowTargetAppModal] = useState(false);
  const [targetAppState, setTargetAppState] = useState<FormState>(initialState);
  const [targetAppTimeout, setTargetAppTimeout] = useState<NodeJS.Timeout | null>(null);
  const [targetApps, setTargetApps] = useState<CompanyTargetApplication[]>([]);
  const [loadingTargetApps, setLoadingTargetApps] = useState(false);
  const [targetAppCompanyId, setTargetAppCompanyId] = useState(currentCompanyId);
  const [targetAppName, setTargetAppName] = useState("");
  const [targetAppBaseUrl, setTargetAppBaseUrl] = useState("");
  const [editingTargetAppId, setEditingTargetAppId] = useState<string | null>(null);
  const allModuleKeys = modules.map((module) => String(module.key));

  function updateAdminRole(checked: boolean) {
    setIsAdminRole(checked);

    if (checked) {
      setSelectedRoleModuleKeys(allModuleKeys);
    }
  }

  function setTargetAppFeedback(message: string, status: FormState["status"]) {
    setTargetAppState({ message, status });
    if (targetAppTimeout) {
      clearTimeout(targetAppTimeout);
    }
    const timeout = setTimeout(() => setTargetAppState(initialState), 4000);
    setTargetAppTimeout(timeout);
  }

  async function loadTargetApps() {
    setLoadingTargetApps(true);
    const response = await fetch("/api/admin/administration/company-target-applications", {
      method: "GET"
    });

    if (!response.ok) {
      setLoadingTargetApps(false);
      setTargetAppFeedback(await readMessage(response, "Unable to load target applications."), "error");
      return;
    }

    const body = await response.json().catch(() => null);
    const apps = Array.isArray(body?.apps) ? body.apps : [];
    setTargetApps(apps);
    setLoadingTargetApps(false);
  }

  async function openTargetAppsModal() {
    setShowTargetAppModal(true);
    setEditingTargetAppId(null);
    setTargetAppName("");
    setTargetAppBaseUrl("");
    await loadTargetApps();
  }

  function closeTargetAppsModal() {
    setShowTargetAppModal(false);
    setEditingTargetAppId(null);
    setTargetAppName("");
    setTargetAppBaseUrl("");
  }

  function beginEditTargetApp(app: CompanyTargetApplication) {
    setEditingTargetAppId(app.id);
    setTargetAppCompanyId(app.companyId);
    setTargetAppName(app.name);
    setTargetAppBaseUrl(app.baseUrl || "");
  }

  async function saveTargetApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!targetAppCompanyId || !targetAppName.trim()) {
      setTargetAppFeedback("Company and target application name are required.", "error");
      return;
    }

    setTargetAppState({ message: "", status: "submitting" });

    const isEditing = Boolean(editingTargetAppId);
    const response = await fetch(
      isEditing
        ? `/api/admin/administration/company-target-applications/${editingTargetAppId}`
        : "/api/admin/administration/company-target-applications",
      {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: targetAppCompanyId,
          name: targetAppName,
          baseUrl: targetAppBaseUrl
        })
      }
    );

    if (!response.ok) {
      setTargetAppFeedback(
        await readMessage(response, isEditing ? "Unable to update target application." : "Unable to create target application."),
        "error"
      );
      return;
    }

    setTargetAppName("");
    setTargetAppBaseUrl("");
    setEditingTargetAppId(null);
    await loadTargetApps();
    setTargetAppFeedback(isEditing ? "Target application updated." : "Target application created.", "success");
  }

  async function removeTargetApp(id: string) {
    setTargetAppState({ message: "", status: "submitting" });

    const response = await fetch(`/api/admin/administration/company-target-applications/${id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      setTargetAppFeedback(await readMessage(response, "Unable to delete target application."), "error");
      return;
    }

    if (editingTargetAppId === id) {
      setEditingTargetAppId(null);
      setTargetAppName("");
      setTargetAppBaseUrl("");
    }

    await loadTargetApps();
    setTargetAppFeedback("Target application deleted.", "success");
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setCompanyState({ message: "", status: "submitting" });

    const form = new FormData(formElement);

    const response = await fetch("/api/admin/administration/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        slug: String(form.get("slug") ?? "")
      })
    });

    if (!response.ok) {
      setCompanyState({ message: await readMessage(response, "Unable to create company."), status: "error" });
      if (companyTimeout) clearTimeout(companyTimeout);
      const timeout = setTimeout(() => setCompanyState(initialState), 4000);
      setCompanyTimeout(timeout);
      return;
    }

    formElement.reset();
    setCompanyState({ message: "Company created.", status: "success" });
    if (companyTimeout) clearTimeout(companyTimeout);
    const timeout = setTimeout(() => setCompanyState(initialState), 4000);
    setCompanyTimeout(timeout);
    router.refresh();
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setRoleState({ message: "", status: "submitting" });

    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "");
    const companyIds = [currentCompanyId];
    const moduleKeys = isAdminRole ? allModuleKeys : selectedRoleModuleKeys;

    if (!name.trim()) {
      setRoleState({ message: "Role name is required.", status: "error" });
      return;
    }

    if (!isAdminRole && moduleKeys.length === 0) {
      setRoleState({ message: "At least one module must be selected.", status: "error" });
      return;
    }

    const response = await fetch("/api/admin/administration/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyIds,
        name,
        isAdminRole,
        description: String(form.get("description") ?? ""),
        moduleKeys
      })
    });

    if (!response.ok) {
      setRoleState({ message: await readMessage(response, "Unable to create role."), status: "error" });
      if (roleTimeout) clearTimeout(roleTimeout);
      const timeout = setTimeout(() => setRoleState(initialState), 4000);
      setRoleTimeout(timeout);
      return;
    }

    formElement.reset();
    setSelectedRoleModuleKeys([]);
    setIsAdminRole(false);
    setRoleState({ message: "Role created.", status: "success" });
    if (roleTimeout) clearTimeout(roleTimeout);
    const timeout = setTimeout(() => setRoleState(initialState), 4000);
    setRoleTimeout(timeout);
    router.refresh();
  }

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={createCompany}>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Create company</h2>
            <p className="text-sm text-slate-500">Register a tenant company before assigning roles and users.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Company name</span>
            <input
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
              name="name"
              placeholder="Acme Corporation"
              required
              type="text"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Company slug</span>
            <input
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
              name="slug"
              placeholder="acme"
              type="text"
            />
          </label>
        </div>

        {companyState.message ? (
          <div className={`mt-4 rounded-lg px-3 py-2 text-sm flex items-center justify-between ${
            companyState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}>
            <span>{companyState.message}</span>
            <button
              onClick={() => setCompanyState(initialState)}
              className="ml-2 text-xs font-semibold opacity-70 hover:opacity-100"
              type="button"
            >
              ✕
            </button>
          </div>
        ) : null}

        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={companyState.status === "submitting"}
          type="submit"
        >
          {companyState.status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create company
        </button>

        <button
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={openTargetAppsModal}
          type="button"
        >
          Manage target applications
        </button>
      </form>

      <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={createRole}>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Create role</h2>
            <p className="text-sm text-slate-500">Add company-specific roles for future user assignments.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Role name</span>
              <input
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                name="name"
                placeholder="Billing Manager"
                required
                type="text"
              />
            </label>

            <label className="flex h-full min-h-20 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <input
                checked={isAdminRole}
                className="h-4 w-4 rounded border-slate-300"
                name="isAdminRole"
                onChange={(event) => updateAdminRole(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">Admin role</span>
                <span className="block text-xs text-slate-500">Grants all Control Panel modules.</span>
              </span>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Description</span>
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
              name="description"
              placeholder="Can manage billing records and related uploads."
            />
          </label>

          <HierarchicalModuleSelector
            disabled={isAdminRole}
            label="Select Modules"
            lockedValues={isAdminRole ? allModuleKeys : []}
            modules={modules}
            onChange={setSelectedRoleModuleKeys}
            selectedValues={isAdminRole ? allModuleKeys : selectedRoleModuleKeys}
          />
        </div>

        {roleState.message ? (
          <div className={`mt-4 rounded-lg px-3 py-2 text-sm flex items-center justify-between ${
            roleState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}>
            <span>{roleState.message}</span>
            <button
              onClick={() => setRoleState(initialState)}
              className="ml-2 text-xs font-semibold opacity-70 hover:opacity-100"
              type="button"
            >
              ✕
            </button>
          </div>
        ) : null}

        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={roleState.status === "submitting"}
          type="submit"
        >
          {roleState.status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create role
        </button>
      </form>

      {showTargetAppModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Target applications</h3>
                <p className="text-sm text-slate-500">Create, update, or delete target applications per company.</p>
              </div>
              <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={closeTargetAppsModal} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <form className="grid gap-3 rounded-lg border border-slate-200 p-4" onSubmit={saveTargetApp}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Company</span>
                    <select
                      className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                      onChange={(event) => setTargetAppCompanyId(event.target.value)}
                      value={targetAppCompanyId}
                    >
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Target app name</span>
                    <input
                      className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                      onChange={(event) => setTargetAppName(event.target.value)}
                      placeholder="Support Portal"
                      required
                      type="text"
                      value={targetAppName}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Base URL (optional)</span>
                  <input
                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                    onChange={(event) => setTargetAppBaseUrl(event.target.value)}
                    placeholder="https://app.example.com"
                    type="text"
                    value={targetAppBaseUrl}
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={targetAppState.status === "submitting"}
                    type="submit"
                  >
                    {targetAppState.status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {editingTargetAppId ? "Update target app" : "Create target app"}
                  </button>
                  {editingTargetAppId ? (
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        setEditingTargetAppId(null);
                        setTargetAppName("");
                        setTargetAppBaseUrl("");
                      }}
                      type="button"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>

              {targetAppState.message ? (
                <div className={`rounded-lg px-3 py-2 text-sm ${targetAppState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {targetAppState.message}
                </div>
              ) : null}

              <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Company</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Base URL</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {loadingTargetApps ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={4}>Loading target applications...</td>
                      </tr>
                    ) : targetApps.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={4}>No target applications found.</td>
                      </tr>
                    ) : (
                      targetApps.map((app) => (
                        <tr key={app.id}>
                          <td className="px-3 py-3 text-slate-700">{app.companyName}</td>
                          <td className="px-3 py-3 text-slate-900">{app.name}</td>
                          <td className="px-3 py-3 text-slate-600">{app.baseUrl || "-"}</td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                                onClick={() => beginEditTargetApp(app)}
                                title="Edit"
                                type="button"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-300 text-red-700 hover:bg-red-50"
                                onClick={() => removeTargetApp(app.id)}
                                title="Delete"
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
