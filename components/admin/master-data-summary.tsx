"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, UserCog } from "lucide-react";
import { useToast } from "./toast";
import type { RoleSummary } from "@/lib/admin/administration";
import type { AdminModule } from "@/lib/admin/permissions";

type MasterDataSummaryProps = {
  roles: RoleSummary[];
  modules: AdminModule[];
  onEditRole: (role: RoleSummary) => void;
};

type ConfirmDialog = {
  message: string;
  onConfirm: () => void;
} | null;

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function MasterDataSummary({ roles, onEditRole }: MasterDataSummaryProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  async function deleteRole(role: RoleSummary) {
    setConfirmDialog({
      message: `Are you sure you want to delete "${role.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);

        const response = await fetch(`/api/admin/administration/roles/${role.id}`, {
          method: "DELETE"
        });

        if (!response.ok) {
          showToast(await readMessage(response, "Unable to delete role."), "error");
          return;
        }

        showToast("Role deleted.");
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
                <tr key={role.id}>
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
                                onEditRole(role);
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
