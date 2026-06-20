"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Pencil, Save, ShieldCheck, Trash2, X } from "lucide-react";
import type { CompanySummary, RoleSummary } from "@/lib/admin/administration";

type MasterDataSummaryProps = {
  companies: CompanySummary[];
  roles: RoleSummary[];
};

type Feedback = {
  message: string;
  status: "idle" | "error" | "success";
};

const emptyFeedback: Feedback = {
  message: "",
  status: "idle"
};

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function MasterDataSummary({ companies, roles }: MasterDataSummaryProps) {
  const router = useRouter();
  const [expandedCompanyId, setExpandedCompanyId] = useState(companies[0]?.id ?? "");
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [editingRoleId, setEditingRoleId] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(emptyFeedback);

  const rolesByCompany = useMemo(() => {
    return roles.reduce<Record<string, RoleSummary[]>>((groups, role) => {
      if (!role.companyId) {
        return groups;
      }

      groups[role.companyId] = [...(groups[role.companyId] ?? []), role];
      return groups;
    }, {});
  }, [roles]);

  async function updateCompany(event: FormEvent<HTMLFormElement>, companyId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFeedback(emptyFeedback);

    const response = await fetch(`/api/admin/administration/companies/${companyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        slug: String(form.get("slug") ?? "")
      })
    });

    if (!response.ok) {
      setFeedback({ message: await readMessage(response, "Unable to update company."), status: "error" });
      return;
    }

    setEditingCompanyId("");
    setFeedback({ message: "Company updated.", status: "success" });
    router.refresh();
  }

  async function deleteCompany(company: CompanySummary) {
    if (!window.confirm(`Delete company "${company.name}"?`)) {
      return;
    }

    setFeedback(emptyFeedback);

    const response = await fetch(`/api/admin/administration/companies/${company.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      setFeedback({ message: await readMessage(response, "Unable to delete company."), status: "error" });
      return;
    }

    setFeedback({ message: "Company deleted.", status: "success" });
    router.refresh();
  }

  async function updateRole(event: FormEvent<HTMLFormElement>, roleId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFeedback(emptyFeedback);

    const response = await fetch(`/api/admin/administration/roles/${roleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        isAdminRole: form.get("isAdminRole") === "on",
        description: String(form.get("description") ?? "")
      })
    });

    if (!response.ok) {
      setFeedback({ message: await readMessage(response, "Unable to update role."), status: "error" });
      return;
    }

    setEditingRoleId("");
    setFeedback({ message: "Role updated.", status: "success" });
    router.refresh();
  }

  async function deleteRole(role: RoleSummary) {
    if (!window.confirm(`Delete role "${role.name}"?`)) {
      return;
    }

    setFeedback(emptyFeedback);

    const response = await fetch(`/api/admin/administration/roles/${role.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      setFeedback({ message: await readMessage(response, "Unable to delete role."), status: "error" });
      return;
    }

    setFeedback({ message: "Role deleted.", status: "success" });
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Companies and roles</h2>
          <p className="mt-1 text-sm text-slate-500">Expand a company to manage its roles.</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-slate-500" />
      </div>

      {feedback.message ? (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${
          feedback.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
        }`}>
          {feedback.message}
        </p>
      ) : null}

      <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
        {companies.map((company) => {
          const isExpanded = company.id === expandedCompanyId;
          const companyRoles = rolesByCompany[company.id] ?? [];

          return (
            <article className="bg-white" key={company.id}>
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                {editingCompanyId === company.id ? (
                  <form className="grid flex-1 gap-3 sm:grid-cols-[minmax(180px,1fr)_minmax(140px,0.7fr)_auto]" onSubmit={(event) => updateCompany(event, company.id)}>
                    <input
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                      defaultValue={company.name}
                      name="name"
                      required
                      type="text"
                    />
                    <input
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                      defaultValue={company.slug}
                      name="slug"
                      required
                      type="text"
                    />
                    <div className="flex items-center gap-2">
                      <button aria-label="Save company" className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800" type="submit">
                        <Save className="h-4 w-4" />
                      </button>
                      <button aria-label="Cancel company edit" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" onClick={() => setEditingCompanyId("")} type="button">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => setExpandedCompanyId(isExpanded ? "" : company.id)}
                      type="button"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-950">{company.name}</span>
                        <span className="block text-xs text-slate-500">{company.slug} · {companyRoles.length} roles · {company.userCount} users</span>
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button aria-label="Edit company" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" onClick={() => setEditingCompanyId(company.id)} type="button">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button aria-label="Delete company" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50" onClick={() => deleteCompany(company)} type="button">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {isExpanded ? (
                <div className="border-t border-slate-100 bg-[#f8fafc] px-4 py-3">
                  {companyRoles.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-slate-100 text-xs uppercase tracking-normal text-slate-600">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Role</th>
                            <th className="px-3 py-2 font-semibold">Admin</th>
                            <th className="px-3 py-2 font-semibold">Description</th>
                            <th className="w-24 px-3 py-2 text-right font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {companyRoles.map((role) => (
                            <tr key={role.id}>
                              {editingRoleId === role.id ? (
                                <td className="px-3 py-2" colSpan={4}>
                                  <form className="grid gap-3 lg:grid-cols-[minmax(160px,0.8fr)_minmax(130px,0.55fr)_minmax(220px,1fr)_auto]" onSubmit={(event) => updateRole(event, role.id)}>
                                    <input
                                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                                      defaultValue={role.name}
                                      name="name"
                                      required
                                      type="text"
                                    />
                                    <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
                                      <input className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-900" defaultChecked={role.isAdminRole} name="isAdminRole" type="checkbox" />
                                      Admin role
                                    </label>
                                    <input
                                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                                      defaultValue={role.description ?? ""}
                                      name="description"
                                      type="text"
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                      <button aria-label="Save role" className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800" type="submit">
                                        <Save className="h-4 w-4" />
                                      </button>
                                      <button aria-label="Cancel role edit" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" onClick={() => setEditingRoleId("")} type="button">
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </form>
                                </td>
                              ) : (
                                <>
                                  <td className="px-3 py-2 font-medium text-slate-950">{role.name}</td>
                                  <td className="px-3 py-2 text-slate-600">
                                    {role.isAdminRole ? (
                                      <span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-semibold text-white">Yes</span>
                                    ) : (
                                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">No</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">{role.description || "No description"}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                      <button aria-label="Edit role" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" onClick={() => setEditingRoleId(role.id)} type="button">
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button aria-label="Delete role" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50" onClick={() => deleteRole(role)} type="button">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-500">
                      No roles have been created for this company yet.
                    </p>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
