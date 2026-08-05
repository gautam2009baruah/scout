"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, HelpCircle, Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { HierarchicalModuleSelector } from "./hierarchical-module-selector";
import { useToast } from "./toast";
import type { AdminModule } from "@/lib/admin/permissions";
import type { CompanySummary, RoleSummary } from "@/lib/admin/administration";

type MasterDataFormsProps = {
  companies: CompanySummary[];
  modules: AdminModule[];
  currentCompanyId: string;
  editingRole: RoleSummary | null;
  onRoleEditComplete: () => void;
};

type CompanyTargetApplication = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
};

type ChatbotEnvironment = {
  id: string;
  targetAppId: string;
  name: string;
  url: string;
  isProduction: boolean;
  activityLoggingEnabled: boolean;
};

type ConfirmDialog = {
  message: string;
  onConfirm: () => void;
} | null;

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

function HelpHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-slate-400" tabIndex={0} />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-normal normal-case leading-4 text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}

export function MasterDataForms({ companies, modules, currentCompanyId, editingRole, onRoleEditComplete }: MasterDataFormsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [selectedRoleModuleKeys, setSelectedRoleModuleKeys] = useState<string[]>([]);
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [showTargetAppModal, setShowTargetAppModal] = useState(false);
  const [isSavingTargetApp, setIsSavingTargetApp] = useState(false);
  const [targetApps, setTargetApps] = useState<CompanyTargetApplication[]>([]);
  const [loadingTargetApps, setLoadingTargetApps] = useState(false);
  const [targetAppName, setTargetAppName] = useState("");
  const [editingTargetAppId, setEditingTargetAppId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [showEnvironmentsModal, setShowEnvironmentsModal] = useState(false);
  const [environmentTargetAppId, setEnvironmentTargetAppId] = useState<string | null>(null);
  const [environmentsByTargetApp, setEnvironmentsByTargetApp] = useState<Record<string, ChatbotEnvironment[]>>({});
  const [loadingEnvironments, setLoadingEnvironments] = useState(false);
  const [newEnvironmentName, setNewEnvironmentName] = useState("");
  const [newEnvironmentUrl, setNewEnvironmentUrl] = useState("");
  const [newEnvironmentIsProduction, setNewEnvironmentIsProduction] = useState(false);
  const [newEnvironmentActivityLoggingEnabled, setNewEnvironmentActivityLoggingEnabled] = useState(false);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [isSavingEnvironment, setIsSavingEnvironment] = useState(false);
  const allModuleKeys = modules.map((module) => String(module.key));
  const modalEnvironments = environmentTargetAppId ? (environmentsByTargetApp[environmentTargetAppId] ?? []) : [];

  function isValidHttpUrl(value: string) {
    try {
      const parsed = new URL(value.trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  useEffect(() => {
    setRoleName(editingRole?.name ?? "");
    setRoleDescription(editingRole?.description ?? "");
    setIsAdminRole(editingRole?.isAdminRole ?? false);
    setSelectedRoleModuleKeys(editingRole?.moduleKeys?.map(String) ?? []);
  }, [editingRole]);

  function updateAdminRole(checked: boolean) {
    setIsAdminRole(checked);

    if (checked) {
      setSelectedRoleModuleKeys(allModuleKeys);
    }
  }

  async function loadTargetApps() {
    setLoadingTargetApps(true);
    const response = await fetch("/api/admin/administration/company-target-applications", {
      method: "GET"
    });

    if (!response.ok) {
      setLoadingTargetApps(false);
      showToast(await readMessage(response, "Unable to load target applications."), "error");
      return [] as CompanyTargetApplication[];
    }

    const body = await response.json().catch(() => null);
    const apps = Array.isArray(body?.apps) ? body.apps : [];
    const companyApps = apps.filter((app: CompanyTargetApplication) => app.companyId === currentCompanyId);
    setTargetApps(companyApps);
    setLoadingTargetApps(false);
    return companyApps;
  }

  async function openTargetAppsModal() {
    setShowTargetAppModal(true);
    setEditingTargetAppId(null);
    setTargetAppName("");
    await loadTargetApps();
  }

  function closeTargetAppsModal() {
    setShowTargetAppModal(false);
    setEditingTargetAppId(null);
    setTargetAppName("");
  }

  function beginEditTargetApp(app: CompanyTargetApplication) {
    setEditingTargetAppId(app.id);
    setTargetAppName(app.name);
  }

  async function saveTargetApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!targetAppName.trim()) {
      showToast("Target application name is required.", "error");
      return;
    }

    setIsSavingTargetApp(true);

    const isEditing = Boolean(editingTargetAppId);
    const response = await fetch(
      isEditing
        ? `/api/admin/administration/company-target-applications/${editingTargetAppId}`
        : "/api/admin/administration/company-target-applications",
      {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: currentCompanyId,
          name: targetAppName
        })
      }
    );

    if (!response.ok) {
      setIsSavingTargetApp(false);
      showToast(
        await readMessage(response, isEditing ? "Unable to update target application." : "Unable to create target application."),
        "error"
      );
      return;
    }

    setTargetAppName("");
    setEditingTargetAppId(null);
    await loadTargetApps();
    setIsSavingTargetApp(false);
    showToast(isEditing ? "Target application updated." : "Target application created.");
  }

  async function removeTargetApp(id: string) {
    const app = targetApps.find((item) => item.id === id);
    setConfirmDialog({
      message: `Are you sure you want to delete "${app?.name ?? "this target app"}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setIsSavingTargetApp(true);

        const response = await fetch(`/api/admin/administration/company-target-applications/${id}`, {
          method: "DELETE"
        });

        if (!response.ok) {
          setIsSavingTargetApp(false);
          showToast(await readMessage(response, "Unable to delete target application."), "error");
          return;
        }

        if (editingTargetAppId === id) {
          setEditingTargetAppId(null);
          setTargetAppName("");
        }

        await loadTargetApps();
        setIsSavingTargetApp(false);
        showToast("Target application deleted.");
      }
    });
  }

  async function loadEnvironments(targetAppId: string) {
    if (!targetAppId) {
      return;
    }

    setLoadingEnvironments(true);
    const response = await fetch(`/api/admin/chatbot-settings/environments?targetAppId=${encodeURIComponent(targetAppId)}`, { method: "GET" });
    const body = await response.json().catch(() => null);
    setLoadingEnvironments(false);

    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to load environments.", "error");
      return;
    }

    setEnvironmentsByTargetApp((current) => ({
      ...current,
      [targetAppId]: Array.isArray(body?.environments) ? body.environments : []
    }));
  }

  async function openEnvironmentsModal() {
    setShowEnvironmentsModal(true);
    resetEnvironmentForm();

    let apps = targetApps;
    if (apps.length === 0) {
      apps = await loadTargetApps();
    }

    const firstTargetAppId = apps[0]?.id ?? null;
    setEnvironmentTargetAppId(firstTargetAppId);
    if (firstTargetAppId) {
      await loadEnvironments(firstTargetAppId);
    }
  }

  function closeEnvironmentsModal() {
    setShowEnvironmentsModal(false);
    setEditingEnvironmentId(null);
    setNewEnvironmentName("");
    setNewEnvironmentUrl("");
    setNewEnvironmentIsProduction(false);
    setNewEnvironmentActivityLoggingEnabled(false);
  }

  function resetEnvironmentForm() {
    setEditingEnvironmentId(null);
    setNewEnvironmentName("");
    setNewEnvironmentUrl("");
    setNewEnvironmentIsProduction(false);
    setNewEnvironmentActivityLoggingEnabled(false);
  }

  function beginEditEnvironment(env: ChatbotEnvironment) {
    setEditingEnvironmentId(env.id);
    setNewEnvironmentName(env.name);
    setNewEnvironmentUrl(env.url);
    setNewEnvironmentIsProduction(env.isProduction);
    setNewEnvironmentActivityLoggingEnabled(env.activityLoggingEnabled);
  }

  // Single create/update form, mirroring the target-app modal above — edits
  // open in this shared form rather than turning the list row itself into
  // inputs.
  async function saveEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!environmentTargetAppId) {
      return;
    }

    const name = newEnvironmentName.trim();
    if (!name) {
      showToast("Environment name is required.", "error");
      return;
    }

    if (!isValidHttpUrl(newEnvironmentUrl)) {
      showToast("A valid environment URL is required.", "error");
      return;
    }

    setIsSavingEnvironment(true);

    const isEditing = Boolean(editingEnvironmentId);
    const response = await fetch(
      isEditing ? `/api/admin/chatbot-settings/environments/${editingEnvironmentId}` : "/api/admin/chatbot-settings/environments",
      {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url: newEnvironmentUrl.trim(),
          targetAppId: environmentTargetAppId,
          isProduction: newEnvironmentIsProduction,
          activityLoggingEnabled: newEnvironmentActivityLoggingEnabled
        })
      }
    );

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setIsSavingEnvironment(false);
      showToast(typeof body?.message === "string" ? body.message : isEditing ? "Unable to update environment." : "Unable to create environment.", "error");
      return;
    }

    const next = Array.isArray(body?.environments) ? body.environments : [];
    const nextTargetAppId = next[0]?.targetAppId || environmentTargetAppId;
    setEnvironmentsByTargetApp((current) => ({
      ...current,
      [nextTargetAppId]: next
    }));
    resetEnvironmentForm();
    setIsSavingEnvironment(false);
    showToast(isEditing ? "Environment updated." : "Environment created.");
  }

  function requestDeleteEnvironment(id: string, name: string) {
    setConfirmDialog({
      message: `Delete environment "${name}"? This is allowed only when no API key uses it.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        if (!environmentTargetAppId) {
          return;
        }

        const response = await fetch(`/api/admin/chatbot-settings/environments/${id}`, { method: "DELETE" });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          showToast(typeof body?.message === "string" ? body.message : "Unable to delete environment.", "error");
          return;
        }

        setEnvironmentsByTargetApp((current) => ({
          ...current,
          [environmentTargetAppId]: Array.isArray(body?.environments) ? body.environments : []
        }));
        if (editingEnvironmentId === id) {
          resetEnvironmentForm();
        }
        showToast("Environment deleted.");
      }
    });
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setIsCreatingCompany(true);

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
      setIsCreatingCompany(false);
      showToast(await readMessage(response, "Unable to create company."), "error");
      return;
    }

    formElement.reset();
    setIsCreatingCompany(false);
    showToast("Company created.");
    router.refresh();
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "");
    const companyIds = [currentCompanyId];
    const moduleKeys = isAdminRole ? allModuleKeys : selectedRoleModuleKeys;

    if (!name.trim()) {
      showToast("Role name is required.", "error");
      return;
    }

    if (!isAdminRole && moduleKeys.length === 0) {
      showToast("At least one module must be selected.", "error");
      return;
    }

    setIsCreatingRole(true);

    const isEditing = Boolean(editingRole);
    const response = await fetch(isEditing ? `/api/admin/administration/roles/${editingRole?.id}` : "/api/admin/administration/roles", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isEditing ? {} : { companyIds }),
        name,
        isAdminRole,
        description: String(form.get("description") ?? ""),
        moduleKeys
      })
    });

    if (!response.ok) {
      setIsCreatingRole(false);
      showToast(await readMessage(response, isEditing ? "Unable to update role." : "Unable to create role."), "error");
      return;
    }

    formElement.reset();
    setSelectedRoleModuleKeys([]);
    setIsAdminRole(false);
    setRoleName("");
    setRoleDescription("");
    setIsCreatingRole(false);
    if (isEditing) {
      onRoleEditComplete();
    }
    showToast(isEditing ? "Role updated." : "Role created.");
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

        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isCreatingCompany}
          type="submit"
        >
          {isCreatingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create company
        </button>

        <button
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={openTargetAppsModal}
          type="button"
        >
          Manage target applications
        </button>

        <button
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={openEnvironmentsModal}
          type="button"
        >
          Manage Environments
        </button>
      </form>

      <form id="role-form" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={saveRole}>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">{editingRole ? "Update Role" : "Create Role"}</h2>
            <p className="text-sm text-slate-500">{editingRole ? "Update this company role and its module access." : "Add company-specific roles for future user assignments."}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Role name</span>
              <input
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                name="name"
                onChange={(event) => setRoleName(event.target.value)}
                placeholder="Billing Manager"
                required
                type="text"
                value={roleName}
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
              onChange={(event) => setRoleDescription(event.target.value)}
              placeholder="Can manage billing records and related uploads."
              value={roleDescription}
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

        <div className="mt-5 flex gap-3">
          <button
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreatingRole}
            type="submit"
          >
            {isCreatingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : editingRole ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingRole ? "Update Role" : "Create Role"}
          </button>
          {editingRole ? (
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={onRoleEditComplete}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
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
                <p className="text-sm text-slate-500">Managing apps for selected company: <span className="font-medium text-slate-700">{companies.find((company) => company.id === currentCompanyId)?.name ?? "Current company"}</span></p>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                  <input
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                    onChange={(event) => setTargetAppName(event.target.value)}
                    placeholder="Target app name"
                    required
                    type="text"
                    value={targetAppName}
                  />
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSavingTargetApp}
                    type="submit"
                  >
                    {isSavingTargetApp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {editingTargetAppId ? "Update target app" : "Create target app"}
                  </button>
                  {editingTargetAppId ? (
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        setEditingTargetAppId(null);
                        setTargetAppName("");
                      }}
                      type="button"
                    >
                      Cancel edit
                    </button>
                  ) : <span />}
                </div>
              </form>

              <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Name</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {loadingTargetApps ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={2}>Loading target applications...</td>
                      </tr>
                    ) : targetApps.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={2}>No target applications found.</td>
                      </tr>
                    ) : (
                      targetApps.map((app) => (
                        <tr key={app.id}>
                          <td className="px-3 py-3 text-slate-900">{app.name}</td>
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

      {showEnvironmentsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Manage Environments</h3>
                <p className="text-sm text-slate-500">Create, update, or delete environments and their URLs per target application.</p>
              </div>
              <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={closeEnvironmentsModal} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <select
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                value={environmentTargetAppId ?? ""}
                onChange={(event) => {
                  const nextTargetAppId = event.target.value;
                  setEnvironmentTargetAppId(nextTargetAppId);
                  resetEnvironmentForm();
                  void loadEnvironments(nextTargetAppId);
                }}
              >
                {targetApps.length === 0 ? <option value="">No target applications found</option> : null}
                {targetApps.map((app) => (
                  <option key={app.id} value={app.id}>{app.name}</option>
                ))}
              </select>

              <form className="grid gap-3 rounded-lg border border-slate-200 p-4" onSubmit={saveEnvironment}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <input
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                    onChange={(event) => setNewEnvironmentName(event.target.value)}
                    placeholder="Environment name"
                    required
                    type="text"
                    value={newEnvironmentName}
                  />
                  <input
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                    onChange={(event) => setNewEnvironmentUrl(event.target.value)}
                    placeholder="https://app.example.com"
                    required
                    type="text"
                    value={newEnvironmentUrl}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    checked={newEnvironmentIsProduction}
                    className="h-4 w-4 rounded border-slate-300"
                    onChange={(event) => setNewEnvironmentIsProduction(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="inline-flex items-center gap-1.5">
                    Is production
                    <HelpHint text="Versions are v{major}.{build} (e.g. 1.003). Publishing bumps the build number. The major number only advances the first time a build is promoted to an environment marked production here — promoting that same build to another production environment afterward, or rolling a production environment back to an older build, never changes it again." />
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    checked={newEnvironmentActivityLoggingEnabled}
                    className="h-4 w-4 rounded border-slate-300"
                    onChange={(event) => setNewEnvironmentActivityLoggingEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="inline-flex items-center gap-1.5">
                    Log trigger &amp; chat activity
                    <HelpHint text="Off by default. When enabled, chatbot-triggered orchestration runs and chat queries made through this environment are recorded for Triggers Monitoring and Chatbot Analytics. Leave disabled for environments (e.g. dev/test) you don't want accumulating monitoring data." />
                  </span>
                </label>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={!environmentTargetAppId || isSavingEnvironment}
                    type="submit"
                  >
                    {isSavingEnvironment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {editingEnvironmentId ? "Update environment" : "Add environment"}
                  </button>
                  {editingEnvironmentId ? (
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      onClick={resetEnvironmentForm}
                      type="button"
                    >
                      Cancel edit
                    </button>
                  ) : <span />}
                </div>
              </form>

              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                {loadingEnvironments ? (
                  <p className="p-4 text-sm text-slate-500">Loading environments...</p>
                ) : modalEnvironments.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">No environments created yet.</p>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {modalEnvironments.map((env) => (
                      <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 p-3" key={env.id}>
                        <p className="truncate text-sm text-slate-800">
                          {env.name}
                          {env.isProduction ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Production</span> : null}
                          {env.activityLoggingEnabled ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Logging</span> : null}
                        </p>
                        <p className="truncate text-sm text-slate-500">{env.url || "-"}</p>
                        <div className="flex justify-end gap-1">
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700"
                            onClick={() => beginEditEnvironment(env)}
                            title="Edit"
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700"
                            onClick={() => requestDeleteEnvironment(env.id, env.name)}
                            title="Delete"
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-6 max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
            <p className="text-sm text-slate-900 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
