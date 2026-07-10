"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, UserPlus } from "lucide-react";
import { HierarchicalModuleSelector } from "./hierarchical-module-selector";
import type { AdminModule } from "@/lib/admin/permissions";
import type { RoleSummary } from "@/lib/admin/administration";

type UserRegisterFormProps = {
  currentCompanyId: string;
  currentCompanyName: string;
  modules: AdminModule[];
  roles: RoleSummary[];
};

type FormState = {
  message: string;
  status: "idle" | "submitting" | "success" | "error";
};

type FormErrors = {
  employeeCode?: string;
  modules?: string;
};

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function UserRegisterForm({
  currentCompanyId,
  currentCompanyName,
  modules,
  roles
}: UserRegisterFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ message: "", status: "idle" });
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);
  const [formTimeout, setFormTimeout] = useState<NodeJS.Timeout | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const allModuleKeys = modules.map((module) => String(module.key));
  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.name.localeCompare(b.name)), [roles]);

  function applyRoleDefaults(roleId: string) {
    const role = roles.find((item) => item.id === roleId);
    setSelectedModuleKeys(role?.moduleKeys.map(String) ?? []);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setState({ message: "", status: "submitting" });
    setFormErrors({});

    const employeeCode = String(form.get("employeeCode") ?? "").trim();
    const errors: FormErrors = {};

    if (!employeeCode) {
      errors.employeeCode = "User code is required.";
    }

    if (selectedModuleKeys.length === 0) {
      errors.modules = "At least one module must be selected.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setState({ message: "", status: "idle" });
      return;
    }

    const response = await fetch("/api/admin/user-management", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyIds: [currentCompanyId],
        roleId: String(form.get("roleId") ?? ""),
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        employeeCode: employeeCode,
        moduleKeys: selectedModuleKeys
      })
    });

    if (!response.ok) {
      setState({ message: await readMessage(response, "Unable to register user."), status: "error" });
      if (formTimeout) clearTimeout(formTimeout);
      const timeout = setTimeout(() => setState({ message: "", status: "idle" }), 4000);
      setFormTimeout(timeout);
      return;
    }

    formElement.reset();
    setSelectedModuleKeys([]);
    setFormErrors({});
    setState({ message: "User registered and notification email created.", status: "success" });
    if (formTimeout) clearTimeout(formTimeout);
    const timeout = setTimeout(() => setState({ message: "", status: "idle" }), 4000);
    setFormTimeout(timeout);
    
    // Refresh immediately to show the new user in the grid
    // Don't wait for the success message timeout
    setTimeout(() => router.refresh(), 100);
  }

  return (
    <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submit}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
          <UserPlus className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Register user</h2>
          <p className="text-sm text-slate-500">Add a new user to {currentCompanyName}.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* First Row - Full name, Email, User code */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Full name</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
            name="name"
            placeholder="Priya Sharma"
            required
            type="text"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
            name="email"
            placeholder="priya@company.com"
            required
            type="email"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">User code</span>
          <input
            className={`mt-2 h-11 w-full rounded-lg border px-3 text-sm outline-none focus:ring-4 ${
              formErrors.employeeCode
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/10"
                : "border-slate-200 focus:border-slate-900 focus:ring-slate-900/10"
            }`}
            name="employeeCode"
            placeholder="Enter user code or confirm email"
            type="text"
          />
          {formErrors.employeeCode && (
            <p className="mt-2 text-xs text-red-600">{formErrors.employeeCode}</p>
          )}
        </label>

        {/* Second Row - Role, Control Panel modules, Button */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Role</span>
          <select
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
            name="roleId"
            onChange={(event) => applyRoleDefaults(event.target.value)}
            required
          >
            <option value="">Select role</option>
            {sortedRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <HierarchicalModuleSelector
            label="Control Panel modules"
            modules={modules}
            onChange={(values) => {
              setSelectedModuleKeys(values);
              if (formErrors.modules) {
                setFormErrors((prev) => ({ ...prev, modules: undefined }));
              }
            }}
            selectedValues={selectedModuleKeys}
          />
          {formErrors.modules && (
            <p className="mt-2 text-xs text-red-600">{formErrors.modules}</p>
          )}
        </div>

        <div className="flex items-end">
          <button
            className="h-11 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={state.status === "submitting"}
            type="submit"
          >
            {state.status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Register user and send email
          </button>
        </div>
      </div>

      {state.message ? (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm flex items-center justify-between ${
          state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
        }`}>
          <span>{state.message}</span>
          <button
            onClick={() => setState({ message: "", status: "idle" })}
            className="ml-2 text-xs font-semibold opacity-70 hover:opacity-100"
            type="button"
          >
            ✕
          </button>
        </div>
      ) : null}
    </form>
  );
}
