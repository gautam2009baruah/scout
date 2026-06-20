"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus, ShieldCheck } from "lucide-react";
import { MultiSelectDropdown } from "./multi-select-dropdown";
import type { AdminModule } from "@/lib/admin/permissions";
import type { CompanySummary } from "@/lib/admin/administration";

type FormState = {
  message: string;
  status: "idle" | "submitting" | "success" | "error";
};

type MasterDataFormsProps = {
  companies: CompanySummary[];
  modules: AdminModule[];
};

const initialState: FormState = {
  message: "",
  status: "idle"
};

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function MasterDataForms({ companies, modules }: MasterDataFormsProps) {
  const router = useRouter();
  const [companyState, setCompanyState] = useState<FormState>(initialState);
  const [roleState, setRoleState] = useState<FormState>(initialState);
  const [selectedRoleCompanyIds, setSelectedRoleCompanyIds] = useState<string[]>([]);
  const [selectedRoleModuleKeys, setSelectedRoleModuleKeys] = useState<string[]>([]);
  const [isAdminRole, setIsAdminRole] = useState(false);
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
      return;
    }

    formElement.reset();
    setCompanyState({ message: "Company created.", status: "success" });
    router.refresh();
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setRoleState({ message: "", status: "submitting" });

    const form = new FormData(formElement);
    const companyIds = selectedRoleCompanyIds.length ? selectedRoleCompanyIds : form.getAll("companyIds").map(String);
    const name = String(form.get("name") ?? "");

    if (companyIds.length === 0 || !name.trim()) {
      setRoleState({ message: "Company and role name are required.", status: "error" });
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
        moduleKeys: isAdminRole ? allModuleKeys : selectedRoleModuleKeys.length ? selectedRoleModuleKeys : form.getAll("moduleKeys").map(String)
      })
    });

    if (!response.ok) {
      setRoleState({ message: await readMessage(response, "Unable to create role."), status: "error" });
      return;
    }

    formElement.reset();
    setSelectedRoleCompanyIds([]);
    setSelectedRoleModuleKeys([]);
    setIsAdminRole(false);
    setRoleState({ message: "Role created.", status: "success" });
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
          <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            companyState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}>
            {companyState.message}
          </p>
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
          <MultiSelectDropdown
            emptyLabel="Select companies"
            label="Companies"
            name="companyIds"
            onChange={setSelectedRoleCompanyIds}
            options={companies.map((company) => ({ label: company.name, value: company.id }))}
            selectedValues={selectedRoleCompanyIds}
          />

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

          <MultiSelectDropdown
            emptyLabel="Select modules"
            label="Role module defaults"
            lockedValues={isAdminRole ? allModuleKeys : []}
            name="moduleKeys"
            onChange={setSelectedRoleModuleKeys}
            options={modules.map((module) => ({ disabled: isAdminRole, label: module.name, value: String(module.key) }))}
            selectedValues={isAdminRole ? allModuleKeys : selectedRoleModuleKeys}
          />
        </div>

        {roleState.message ? (
          <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            roleState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}>
            {roleState.message}
          </p>
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
