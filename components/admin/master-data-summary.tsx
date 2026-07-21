"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, ShieldCheck, Trash2, UserCog, X } from "lucide-react";
import { HierarchicalModuleSelector } from "./hierarchical-module-selector";
import type { RoleSummary } from "@/lib/admin/administration";
import type { AdminModule } from "@/lib/admin/permissions";

type MasterDataSummaryProps = {
  roles: RoleSummary[];
  modules: AdminModule[];
};

type Feedback = {
  message: string;
  status: "idle" | "error" | "success";
};

type ConfirmDialog = {
  message: string;
  onConfirm: () => void;
} | null;

const emptyFeedback: Feedback = {
  message: "",
  status: "idle"
};

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function MasterDataSummary({ roles, modules }: MasterDataSummaryProps) {
  const router = useRouter();
  const [editingRoleId, setEditingRoleId] = useState("");
  const [editingRoleModules, setEditingRoleModules] = useState<string[]>([]);
  const [editingRoleIsAdmin, setEditingRoleIsAdmin] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(emptyFeedback);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [feedbackTimeout, setFeedbackTimeout] = useState<NodeJS.Timeout | null>(null);
  const allModuleKeys = modules.map((module) => String(module.key));

  async function updateRole(event: FormEvent<HTMLFormElement>, roleId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFeedback(emptyFeedback);

    const moduleKeys = editingRoleIsAdmin ? allModuleKeys : editingRoleModules;

    if (moduleKeys.length === 0 && !editingRoleIsAdmin) {
      setFeedback({ message: "At least one module must be selected.", status: "error" });
      return;
    }

    const response = await fetch(`/api/admin/administration/roles/${roleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        isAdminRole: editingRoleIsAdmin,
        description: String(form.get("description") ?? ""),
        moduleKeys
      })
    });

    if (!response.ok) {
      setFeedback({ message: await readMessage(response, "Unable to update role."), status: "error" });
      return;
    }

    setEditingRoleId("");
    setEditingRoleModules([]);
    setEditingRoleIsAdmin(false);
    setFeedback({ message: "Role updated.", status: "success" });
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    const timeout = setTimeout(() => setFeedback(emptyFeedback), 4000);
    setFeedbackTimeout(timeout);
    router.refresh();
  }

  async function deleteRole(role: RoleSummary) {
    setConfirmDialog({
      message: `Are you sure you want to delete "${role.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setFeedback(emptyFeedback);

        const response = await fetch(`/api/admin/administration/roles/${role.id}`, {
          method: "DELETE"
        });

        if (!response.ok) {
          setFeedback({ message: await readMessage(response, "Unable to delete role."), status: "error" });
          if (feedbackTimeout) clearTimeout(feedbackTimeout);
          const timeout = setTimeout(() => setFeedback(emptyFeedback), 4000);
          setFeedbackTimeout(timeout);
          return;
        }

        setFeedback({ message: "Role deleted.", status: "success" });
        if (feedbackTimeout) clearTimeout(feedbackTimeout);
        const timeout = setTimeout(() => setFeedback(emptyFeedback), 4000);
        setFeedbackTimeout(timeout);
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Roles</h2>
            <p className="mt-1 text-sm text-slate-500">Manage roles for the selected company.</p>
          </div>
        </div>
      </div>

      {feedback.message ? (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm flex items-center justify-between ${
          feedback.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
        }`}>
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(emptyFeedback)}
            className="ml-2 text-xs font-semibold opacity-70 hover:opacity-100"
            type="button"
          >
            ✕
          </button>
        </div>
      ) : null}

      {confirmDialog && (
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
      )}

      {roles.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-3 font-semibold text-slate-900">Name</th>
                <th className="px-3 py-3 font-semibold text-slate-900">Admin Role</th>
                <th className="px-3 py-3 font-semibold text-slate-900">Description</th>
                <th className="px-3 py-3 font-semibold text-slate-900"></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className={editingRoleId === role.id ? "border-t border-slate-200" : ""}>
                  {editingRoleId === role.id ? (
                    <td className="px-3 py-3" colSpan={4}>
                      <form className="grid gap-3" onSubmit={(event) => updateRole(event, role.id)}>
                        {/* First Row: Name, Description, Modules */}
                        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
                          <input
                            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                            defaultValue={role.name}
                            name="name"
                            placeholder="Role name"
                            required
                            type="text"
                          />
                          <input
                            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                            defaultValue={role.description ?? ""}
                            name="description"
                            placeholder="Description"
                            type="text"
                          />
                          <HierarchicalModuleSelector
                            disabled={editingRoleIsAdmin}
                            label=""
                            modules={modules}
                            onChange={setEditingRoleModules}
                            selectedValues={editingRoleModules}
                          />
                        </div>
                        {/* Second Row: Admin checkbox, Save, Cancel */}
                        <div className="flex items-center gap-2">
                          <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
                            <input
                              className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-900"
                              checked={editingRoleIsAdmin}
                              onChange={(event) => {
                                setEditingRoleIsAdmin(event.target.checked);
                                if (event.target.checked) {
                                  setEditingRoleModules(allModuleKeys);
                                }
                              }}
                              name="isAdminRole"
                              type="checkbox"
                            />
                            Admin role
                          </label>
                          {feedback.message && editingRoleId === role.id ? (
                            <p className={`rounded-lg px-3 py-2 text-sm flex-1 ${
                              feedback.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                            }`}>
                              {feedback.message}
                            </p>
                          ) : null}
                          <div className="flex items-center justify-end gap-2 ml-auto">
                            <button aria-label="Save role" className="inline-flex h-10 px-4 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800" type="submit">
                              <Save className="h-4 w-4 mr-2" />
                              Save
                            </button>
                            <button aria-label="Cancel role edit" className="inline-flex h-10 px-4 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" onClick={() => setEditingRoleId("")} type="button">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-3 font-medium text-slate-950 border-b border-slate-200">{role.name}</td>
                      <td className="px-3 py-3 text-slate-600 border-b border-slate-200">
                        {role.isAdminRole ? (
                          <span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-semibold text-white">Yes</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">No</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600 border-b border-slate-200">{role.description || "—"}</td>
                      <td className="px-3 py-3 border-b border-slate-200">
                        {role.isSystem ? (
                          <div className="flex items-center justify-end">
                            <span className="text-xs text-slate-500 font-medium">System role</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              aria-label="Edit role"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                              onClick={() => {
                                setEditingRoleModules(role.moduleKeys?.map(String) || []);
                                setEditingRoleIsAdmin(role.isAdminRole);
                                setEditingRoleId(role.id);
                              }}
                              type="button"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button aria-label="Delete role" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50" onClick={() => deleteRole(role)} type="button">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : roles.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-500">
          No roles have been created yet.
        </p>
      ) : null}
    </section>
  );
}
