"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, UserPlus } from "lucide-react";
import { MultiSelectDropdown } from "./multi-select-dropdown";
import type { AdminModule } from "@/lib/admin/permissions";
import type { CompanySummary, RoleSummary } from "@/lib/admin/administration";

type UserRegisterFormProps = {
  companies: CompanySummary[];
  modules: AdminModule[];
  roles: RoleSummary[];
};

type FormState = {
  message: string;
  status: "idle" | "submitting" | "success" | "error";
};

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function UserRegisterForm({ companies, modules, roles }: UserRegisterFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ message: "", status: "idle" });
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>(companies[0]?.id ? [companies[0].id] : []);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);

  const roleOptions = useMemo(() => {
    const byName = new Map<string, RoleSummary>();
    const selectedCompanies = new Set(selectedCompanyIds);

    for (const role of roles) {
      const roleName = role.name.trim().toLowerCase();

      if (selectedCompanies.size > 0) {
        const companiesWithRole = new Set(
          roles
            .filter((candidate) => candidate.name.trim().toLowerCase() === roleName)
            .map((candidate) => candidate.companyId)
        );

        if (selectedCompanyIds.some((companyId) => !companiesWithRole.has(companyId))) {
          continue;
        }
      }

      if (!byName.has(roleName)) {
        byName.set(roleName, role);
      }
    }

    return Array.from(byName.values()).sort((first, second) => first.name.localeCompare(second.name));
  }, [roles, selectedCompanyIds]);

  function applyRoleDefaults(roleId: string) {
    const role = roles.find((item) => item.id === roleId);
    setSelectedModuleKeys(role?.moduleKeys.map(String) ?? []);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setState({ message: "", status: "submitting" });

    const response = await fetch("/api/admin/user-management", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyIds: selectedCompanyIds.length ? selectedCompanyIds : form.getAll("companyIds").map(String),
        roleId: String(form.get("roleId") ?? ""),
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        employeeCode: String(form.get("employeeCode") ?? ""),
        moduleKeys: selectedModuleKeys.length ? selectedModuleKeys : form.getAll("moduleKeys").map(String)
      })
    });

    if (!response.ok) {
      setState({ message: await readMessage(response, "Unable to register user."), status: "error" });
      return;
    }

    formElement.reset();
    setSelectedCompanyIds(companies[0]?.id ? [companies[0].id] : []);
    setSelectedModuleKeys([]);
    setState({ message: "User registered and notification email created.", status: "success" });
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submit}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
          <UserPlus className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Register user</h2>
          <p className="text-sm text-slate-500">Assign a company role and send the right access email.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <MultiSelectDropdown
          emptyLabel="Select companies"
          label="Companies"
          name="companyIds"
          onChange={setSelectedCompanyIds}
          options={companies.map((company) => ({ label: company.name, value: company.id }))}
          selectedValues={selectedCompanyIds}
        />

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Role</span>
          <select className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" name="roleId" onChange={(event) => applyRoleDefaults(event.target.value)} required>
            <option value="">Select role</option>
            {roleOptions.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">User code</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" name="employeeCode" placeholder="USR-001" type="text" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Full name</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" name="name" placeholder="Priya Sharma" required type="text" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" name="email" placeholder="priya@company.com" required type="email" />
        </label>

        <MultiSelectDropdown
          emptyLabel="No Control Panel modules"
          label="Control Panel modules"
          name="moduleKeys"
          onChange={setSelectedModuleKeys}
          options={modules.map((module) => ({ label: module.name, value: String(module.key) }))}
          selectedValues={selectedModuleKeys}
        />
      </div>

      <div className="mt-4 flex justify-end">
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70" disabled={state.status === "submitting"} type="submit">
          {state.status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Register user and send email
        </button>
      </div>

      {state.message ? (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
