"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Save, Search, Trash2, X } from "lucide-react";
import { MultiSelectDropdown } from "./multi-select-dropdown";
import type { EmployeeRow } from "@/lib/admin/user-management";
import type { AdminModule } from "@/lib/admin/permissions";
import type { CompanySummary, RoleSummary } from "@/lib/admin/administration";

type UserListProps = {
  companies: CompanySummary[];
  currentUserId: string;
  employees: EmployeeRow[];
  modules: AdminModule[];
  page: number;
  pageCount: number;
  pageSize: number;
  roles: RoleSummary[];
  total: number;
};

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function UserList({ companies, currentUserId, employees, modules, page, pageCount, pageSize, roles, total }: UserListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [editCompanyIds, setEditCompanyIds] = useState<Record<string, string[]>>({});
  const [editModuleKeys, setEditModuleKeys] = useState<Record<string, string[]>>({});

  const currentCompany = searchParams.get("companyId") || "";
  const currentRole = searchParams.get("roleId") || "";
  const currentStatus = searchParams.get("status") || "";
  const currentSearch = searchParams.get("search") || "";

  const filterRoles = useMemo(
    () => roles.filter((role) => !currentCompany || role.companyId === currentCompany),
    [currentCompany, roles]
  );
  const roleOptions = useMemo(() => {
    const byName = new Map<string, RoleSummary>();

    for (const role of roles) {
      const roleName = role.name.trim().toLowerCase();

      if (!byName.has(roleName)) {
        byName.set(roleName, role);
      }
    }

    return Array.from(byName.values()).sort((first, second) => first.name.localeCompare(second.name));
  }, [roles]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    for (const key of ["companyId", "roleId", "status", "search"]) {
      const value = String(form.get(key) ?? "").trim();

      if (value) {
        params.set(key, value);
      }
    }

    params.set("page", "1");
    params.set("pageSize", String(pageSize));
    router.push(`/control-panel/user-management?${params.toString()}`);
  }

  function pageHref(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    return `/control-panel/user-management?${params.toString()}`;
  }

  async function updateUser(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");

    const response = await fetch(`/api/admin/user-management/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyIds: editCompanyIds[userId] ?? [],
        roleId: String(form.get("roleId") ?? ""),
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        employeeCode: String(form.get("employeeCode") ?? ""),
        status: String(form.get("status") ?? ""),
        moduleKeys: editModuleKeys[userId] ?? []
      })
    });

    if (!response.ok) {
      setMessage(await readMessage(response, "Unable to update user."));
      return;
    }

    setEditingId("");
    setEditCompanyIds((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    setEditModuleKeys((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    router.refresh();
  }

  function startEdit(employee: EmployeeRow) {
    setEditingId(employee.id);
    setEditCompanyIds((current) => ({ ...current, [employee.id]: employee.companyIds }));
    setEditModuleKeys((current) => ({ ...current, [employee.id]: employee.moduleKeys.map(String) }));
  }

  async function deleteUser(employee: EmployeeRow) {
    if (!window.confirm(`Delete user "${employee.name}"?`)) {
      return;
    }

    setMessage("");
    const response = await fetch(`/api/admin/user-management/${employee.id}`, { method: "DELETE" });

    if (!response.ok) {
      setMessage(await readMessage(response, "Unable to delete user."));
      return;
    }

    router.refresh();
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Registered users</h2>
          <p className="text-sm text-slate-500">{total} users found</p>
        </div>
        <form className="grid gap-2 md:grid-cols-[150px_150px_130px_minmax(180px,1fr)_auto]" onSubmit={filter}>
          <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" defaultValue={currentCompany} name="companyId">
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" defaultValue={currentRole} name="roleId">
            <option value="">All roles</option>
            {filterRoles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" defaultValue={currentStatus} name="status">
            <option value="">All statuses</option>
            <option value="invited">Invited</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" defaultValue={currentSearch} name="search" placeholder="Search name, email, code" type="search" />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" type="submit">
            <Search className="h-4 w-4" />
            Filter
          </button>
        </form>
      </div>

      {message ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-slate-950 text-white">
            <tr>
              <th className="px-3 py-3 font-medium">User</th>
              <th className="px-3 py-3 font-medium">Company</th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {employees.map((employee) => {
              const selectedCompanyIds = editCompanyIds[employee.id] ?? employee.companyIds;
              const selectedModuleKeys = editModuleKeys[employee.id] ?? employee.moduleKeys.map(String);

              return (
                <tr key={employee.id}>
                  {editingId === employee.id ? (
                    <td className="px-3 py-3" colSpan={5}>
                      <form className="grid gap-3 lg:grid-cols-4" onSubmit={(event) => updateUser(event, employee.id)}>
                        <div className="lg:col-span-2">
                          <MultiSelectDropdown
                            emptyLabel="Select companies"
                            label="Companies"
                            name="companyIds"
                            onChange={(values) => setEditCompanyIds((current) => ({ ...current, [employee.id]: values }))}
                            options={companies.map((company) => ({ label: company.name, value: company.id }))}
                            selectedValues={selectedCompanyIds}
                          />
                        </div>
                        <select
                          className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                          defaultValue={employee.roleId}
                          name="roleId"
                          onChange={(event) => {
                            const role = roles.find((item) => item.id === event.target.value);
                            setEditModuleKeys((current) => ({ ...current, [employee.id]: role?.moduleKeys.map(String) ?? [] }));
                          }}
                        >
                          {roleOptions.map((role) => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </select>
                        <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" defaultValue={employee.name} name="name" required />
                        <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" defaultValue={employee.email} name="email" required type="email" />
                        <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" defaultValue={employee.employeeCode ?? ""} name="employeeCode" placeholder="User code" />
                        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" defaultValue={employee.status} name="status">
                          <option value="invited">Invited</option>
                          <option value="active">Active</option>
                          <option value="disabled">Disabled</option>
                        </select>
                        <div className="lg:col-span-4">
                          <MultiSelectDropdown
                            emptyLabel="No Control Panel modules"
                            label="Control Panel modules"
                            name="moduleKeys"
                            onChange={(values) => setEditModuleKeys((current) => ({ ...current, [employee.id]: values }))}
                            options={modules.map((module) => ({ label: module.name, value: String(module.key) }))}
                            selectedValues={selectedModuleKeys}
                          />
                        </div>
                        <div className="flex items-center gap-2 lg:col-span-4">
                          <button aria-label="Save user" className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white" type="submit">
                            <Save className="h-4 w-4" />
                          </button>
                          <button aria-label="Cancel user edit" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600" onClick={() => setEditingId("")} type="button">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-950">{employee.name}</p>
                        <p className="text-xs text-slate-500">{employee.email} · {employee.employeeCode || "No code"}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{employee.companyNames.join(", ")}</td>
                      <td className="px-3 py-3 text-slate-600">{employee.roleName}</td>
                      <td className="px-3 py-3 text-slate-600">{employee.status}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button aria-label="Edit user" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100" onClick={() => startEdit(employee)} type="button">
                            <Pencil className="h-4 w-4" />
                          </button>
                          {employee.id !== currentUserId ? (
                            <button aria-label="Delete user" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteUser(employee)} type="button">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">Page {page} of {pageCount}</p>
        <div className="flex items-center gap-2">
          <Link className={`rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={pageHref(Math.max(page - 1, 1))}>Previous</Link>
          <Link className={`rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium ${page >= pageCount ? "pointer-events-none opacity-50" : ""}`} href={pageHref(Math.min(page + 1, pageCount))}>Next</Link>
        </div>
      </div>
    </section>
  );
}
