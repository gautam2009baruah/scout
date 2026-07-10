"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus, ShieldCheck } from "lucide-react";
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
  const allModuleKeys = modules.map((module) => String(module.key));

  function updateAdminRole(checked: boolean) {
    setIsAdminRole(checked);

    if (checked) {
      setSelectedRoleModuleKeys(allModuleKeys);
    }
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
    </section>
  );
}
