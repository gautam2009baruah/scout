"use client";

import { useState } from "react";
import { MasterDataForms } from "./master-data-forms";
import { MasterDataSummary } from "./master-data-summary";
import type { CompanySummary, RoleSummary } from "@/lib/admin/administration";
import type { AdminModule } from "@/lib/admin/permissions";

type MasterDataRoleManagerProps = {
  companies: CompanySummary[];
  currentCompanyId: string;
  modules: AdminModule[];
  roles: RoleSummary[];
};

export function MasterDataRoleManager({ companies, currentCompanyId, modules, roles }: MasterDataRoleManagerProps) {
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);

  function beginRoleEdit(role: RoleSummary) {
    setEditingRole(role);
    requestAnimationFrame(() => {
      document.getElementById("role-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <>
      <MasterDataForms
        companies={companies}
        currentCompanyId={currentCompanyId}
        editingRole={editingRole}
        modules={modules}
        onRoleEditComplete={() => setEditingRole(null)}
      />
      <MasterDataSummary modules={modules} onEditRole={beginRoleEdit} roles={roles} />
    </>
  );
}
