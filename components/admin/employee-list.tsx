"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Search, Trash2, X } from "lucide-react";
import { HierarchicalModuleSelector } from "./hierarchical-module-selector";
import type { EmployeeMembership, EmployeeRow, EmployeeStatus } from "@/lib/admin/user-management";
import type { AdminModule } from "@/lib/admin/permissions";
import type { CompanySummary, RoleSummary } from "@/lib/admin/administration";

type UserListProps = {
  companies: CompanySummary[];
  currentCompanyId: string;
  currentUserId: string;
  employees: EmployeeRow[];
  modules: AdminModule[];
  page: number;
  pageCount: number;
  pageSize: number;
  roles: RoleSummary[];
  total: number;
};

type ConfirmDialog = {
  employee: EmployeeRow;
  reason: string;
} | null;

type EditDialog = {
  employee: EmployeeRow;
  companyId: string;
  roleId: string;
  status: EmployeeStatus;
  moduleKeys: string[];
  name: string;
  email: string;
  employeeCode: string;
  statusReason: string;
} | null;

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function UserList({ companies, currentCompanyId, currentUserId, employees, modules, page, pageCount, pageSize, roles, total }: UserListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [editDialog, setEditDialog] = useState<EditDialog>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.name.localeCompare(b.name)), [roles]);
  const companyOptions = useMemo(() => [...companies].sort((a, b) => a.name.localeCompare(b.name)), [companies]);

  const currentRole = searchParams.get("roleId") || "";
  const currentStatus = searchParams.get("status") || "";
  const currentSearch = searchParams.get("search") || "";

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    params.set("companyId", currentCompanyId);

    for (const key of ["roleId", "status", "search"]) {
      const value = String(form.get(key) ?? "").trim();

      if (value) {
        params.set(key, value);
      }
    }

    params.set("page", "1");
    params.set("pageSize", String(pageSize));
    router.push(`/control-panel/administration/user-management?${params.toString()}`);
  }

  function pageHref(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    return `/control-panel/administration/user-management?${params.toString()}`;
  }

  async function updateUser(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    if (!editDialog) return;

    const form = new FormData(event.currentTarget);
    setToast(null);

    const currentMembership = membershipFor(editDialog.employee, editDialog.companyId);
    if (editDialog.status === "inactive" && currentMembership?.status !== "inactive" && !editDialog.statusReason.trim()) {
      showToast("Reason is required when inactivating a user.", "error");
      return;
    }

    const response = await fetch(`/api/admin/user-management/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: editDialog.companyId,
        roleId: String(form.get("roleId") ?? ""),
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        employeeCode: String(form.get("employeeCode") ?? ""),
        status: editDialog.status,
        statusReason: editDialog.statusReason,
        moduleKeys: editDialog.moduleKeys
      })
    });

    if (!response.ok) {
      showToast(await readMessage(response, "Unable to update user."), "error");
      return;
    }

    setEditDialog(null);
    showToast("User updated successfully.");
    router.refresh();
  }

  function membershipFor(employee: EmployeeRow, companyId: string): EmployeeMembership | undefined {
    return employee.memberships.find((membership) => membership.companyId === companyId);
  }

  function startEdit(employee: EmployeeRow) {
    const companyId = companyOptions.some((company) => company.id === currentCompanyId)
      ? currentCompanyId
      : companyOptions[0]?.id ?? "";
    const membership = membershipFor(employee, companyId);
    setEditDialog({
      employee,
      companyId,
      roleId: membership?.roleId ?? "",
      status: employee.status === "invited" ? "invited" : membership?.status ?? "active",
      moduleKeys: (membership?.moduleKeys ?? []).map(String),
      name: employee.name,
      email: employee.email,
      employeeCode: employee.employeeCode ?? "",
      statusReason: ""
    });
  }

  function updateDialogCompany(companyId: string) {
    if (!editDialog) return;

    const membership = membershipFor(editDialog.employee, companyId);
    setEditDialog({
      ...editDialog,
      companyId,
      roleId: membership?.roleId ?? "",
      status: editDialog.employee.status === "invited" ? "invited" : membership?.status ?? "active",
      statusReason: "",
      moduleKeys: (membership?.moduleKeys ?? []).map(String)
    });
  }

  async function deleteUser() {
    if (!confirmDialog) return;

    if (!confirmDialog.reason.trim()) {
      showToast("Reason is required when deleting a user.", "error");
      return;
    }

    const employee = confirmDialog.employee;
    setConfirmDialog(null);
    setToast(null);
    const response = await fetch(`/api/admin/user-management/${employee.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: confirmDialog.reason })
    });

    if (!response.ok) {
      showToast(await readMessage(response, "Unable to delete user."), "error");
      return;
    }

    showToast("User deleted successfully.");
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
        <div className="flex-shrink-0">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Registered users</h2>
          <p className="text-sm text-slate-500">{total} users found</p>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-nowrap lg:items-center lg:gap-2" onSubmit={filter}>
          <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm flex-shrink-0 lg:w-auto" defaultValue={currentRole} name="roleId">
            <option value="">All roles</option>
            {sortedRoles.filter((role) => role.companyId === currentCompanyId).map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm flex-shrink-0 lg:w-auto" defaultValue={currentStatus} name="status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="invited">Invited</option>
          </select>
          <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm flex-1 lg:flex-initial lg:min-w-[200px]" defaultValue={currentSearch} name="search" placeholder="Search name, email, code" type="search" />
          <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm flex-shrink-0 lg:w-auto" defaultValue={pageSize} name="pageSize" onChange={(e) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("pageSize", e.target.value);
            params.set("page", "1");
            router.push(`/control-panel/administration/user-management?${params.toString()}`);
          }}>
            <option value="10">10 per page</option>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
          <button className="h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white flex-shrink-0 lg:w-auto" type="submit">
            <Search className="h-4 w-4" />
            Filter
          </button>
        </form>
      </div>

      {toast ? (
        <div className="fixed top-4 left-1/2 z-[9999] -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}>
            <span className="text-lg">{toast.type === "success" ? "OK" : "!"}</span>
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 rounded p-0.5 transition-colors hover:bg-black/5" type="button">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-6 max-w-md mx-4">
            <h3 className="text-base font-semibold text-slate-950">Delete user</h3>
            <p className="mt-2 text-sm text-slate-600">Delete "{confirmDialog.employee.name}" globally from all companies. This user will no longer appear in registered users.</p>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Reason</span>
              <textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" onChange={(event) => setConfirmDialog({ ...confirmDialog, reason: event.target.value })} placeholder="Employee resigned, duplicate profile, etc." required value={confirmDialog.reason} />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" type="button">Cancel</button>
              <button onClick={deleteUser} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60" disabled={!confirmDialog.reason.trim()} type="button">Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-slate-950 text-white">
            <tr>
              <th className="px-3 py-3 font-medium w-12">Sno</th>
              <th className="px-3 py-3 font-medium">User</th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {employees.map((employee, index) => (
              <tr key={employee.id}>
                <td className="px-3 py-3 text-center text-slate-500">{(page - 1) * pageSize + index + 1}</td>
                <td className="px-3 py-3">
                  <p className="font-medium text-slate-950">{employee.name}</p>
                  <p className="text-xs text-slate-500">{employee.email} - {employee.employeeCode || "No code"}</p>
                  <p className="mt-1 text-xs text-slate-400">{employee.companyNames.join(", ")}</p>
                </td>
                <td className="px-3 py-3 text-slate-600">{employee.roleName}</td>
                <td className="px-3 py-3 text-slate-600 capitalize">{employee.status === "disabled" ? "inactive" : employee.status}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {!employee.hasSystemRole ? (
                      <button aria-label="Edit user" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100" onClick={() => startEdit(employee)} type="button">
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {!employee.hasSystemRole && employee.id !== currentUserId ? (
                      <button aria-label="Delete user" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50" onClick={() => setConfirmDialog({ employee, reason: "" })} type="button">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editDialog ? (
        <EditUserModal companies={companyOptions} dialog={editDialog} modules={modules} onChange={setEditDialog} onClose={() => setEditDialog(null)} onCompanyChange={updateDialogCompany} onSubmit={(event) => updateUser(event, editDialog.employee.id)} roles={sortedRoles} />
      ) : null}

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

function EditUserModal({ companies, dialog, modules, onChange, onClose, onCompanyChange, onSubmit, roles }: {
  companies: CompanySummary[];
  dialog: NonNullable<EditDialog>;
  modules: AdminModule[];
  onChange(dialog: NonNullable<EditDialog>): void;
  onClose(): void;
  onCompanyChange(companyId: string): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  roles: RoleSummary[];
}) {
  const companyRoles = roles.filter((role) => role.companyId === dialog.companyId);
  const selectedMembership = dialog.employee.memberships.find((membership) => membership.companyId === dialog.companyId);
  const hasMembership = Boolean(selectedMembership);
  const isInvited = dialog.employee.status === "invited";
  const isInactivating = dialog.status === "inactive" && selectedMembership?.status !== "inactive";

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Edit user</h3>
            <p className="text-sm text-slate-500">{hasMembership ? "Update company access and user details." : "Assign this employee to the selected company."}</p>
          </div>
          <button aria-label="Close edit modal" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={onSubmit}>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-700">Company</span>
            <select className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" onChange={(event) => onCompanyChange(event.target.value)} value={dialog.companyId}>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Full name</span>
            <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" name="name" onChange={(event) => onChange({ ...dialog, name: event.target.value })} required value={dialog.name} />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600" name="email" readOnly required type="email" value={dialog.email} />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">User code</span>
            <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" name="employeeCode" onChange={(event) => onChange({ ...dialog, employeeCode: event.target.value })} value={dialog.employeeCode} />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Role</span>
            <select className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" name="roleId" onChange={(event) => {
              const role = companyRoles.find((item) => item.id === event.target.value);
              onChange({ ...dialog, roleId: event.target.value, moduleKeys: role?.moduleKeys.map(String) ?? [] });
            }} required value={dialog.roleId}>
              <option value="">Select role</option>
              {companyRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>

          <div className="md:col-span-2">
            <HierarchicalModuleSelector label="Control Panel modules" modules={modules} onChange={(values) => onChange({ ...dialog, moduleKeys: values })} selectedValues={dialog.moduleKeys} />
          </div>

          <div className="md:col-span-2 rounded-lg border border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Status</p>
                <p className="text-xs text-slate-500">{isInvited ? "Invited users cannot be activated or inactivated until they accept the invitation." : "Toggle the employee between active and inactive."}</p>
              </div>
              {isInvited ? (
                <span className="inline-flex h-10 items-center rounded-lg bg-amber-50 px-4 text-sm font-semibold text-amber-700">Invited</span>
              ) : (
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button className={`h-9 rounded-md px-4 text-sm font-semibold ${dialog.status === "active" ? "bg-slate-950 text-white" : "text-slate-600"}`} onClick={() => onChange({ ...dialog, status: "active", statusReason: "" })} type="button">Active</button>
                  <button className={`h-9 rounded-md px-4 text-sm font-semibold ${dialog.status === "inactive" ? "bg-slate-950 text-white" : "text-slate-600"}`} onClick={() => onChange({ ...dialog, status: "inactive" })} type="button">Inactive</button>
                </div>
              )}
            </div>

            {isInactivating ? (
              <label className="mt-4 block">
                <span className="text-sm font-medium text-slate-700">Reason for inactivation</span>
                <textarea className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" onChange={(event) => onChange({ ...dialog, statusReason: event.target.value })} required value={dialog.statusReason} />
              </label>
            ) : null}
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={onClose} type="button">Cancel</button>
            <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={isInactivating && !dialog.statusReason.trim()} type="submit">Save user</button>
          </div>
        </form>
      </div>
    </div>
  );
}
