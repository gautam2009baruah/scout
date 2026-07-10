import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, MasterDataForms, MasterDataSummary } from "@/components/admin";
import { getMasterData } from "@/lib/admin/administration";
import { MODULE_KEYS, getAllAdminModules, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Company & Role Setup | Scout Admin",
  description: "Create and maintain company and role master data."
};

export default async function MasterDataPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.administration);

  const [{ companies, roles }, modules] = await Promise.all([getMasterData(), getAllAdminModules()]);

  return (
    <AdminShell active={MODULE_KEYS.companyRoleSetup} session={session}>
      <MasterDataForms companies={companies} modules={modules} currentCompanyId={session.user.tenantId} />
      <MasterDataSummary modules={modules} roles={roles.filter(r => r.companyId === session.user.tenantId)} />
    </AdminShell>
  );
}
