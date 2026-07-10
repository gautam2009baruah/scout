import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, TopicManager } from "@/components/admin";
import { getMasterData } from "@/lib/admin/administration";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getTopicAccessAdminData, getTopicWorkspace } from "@/lib/admin/content-structure";

export const metadata: Metadata = {
  title: "Content Structure | Scout Admin",
  description: "Create nested topic folders and assign folder-level access."
};

export default async function TopicsPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.contentStructure);

  const selectedCompanyName = session.availableCompanies.find((company) => company.companyId === session.user.tenantId)?.companyName ?? "";

  const [{ roles }, workspace, accessData] = await Promise.all([
    getMasterData(),
    getTopicWorkspace(session),
    getTopicAccessAdminData(session)
  ]);

  return (
    <AdminShell active={MODULE_KEYS.contentStructure} session={session}>
      <TopicManager
        canManageAccess={workspace.canManageAccess}
        grants={accessData.grants}
        roles={roles.filter((role) => !role.isSystem)}
        selectedCompanyId={session.user.tenantId}
        selectedCompanyName={selectedCompanyName}
        topics={workspace.topics}
        tree={workspace.tree}
        users={accessData.users}
      />
    </AdminShell>
  );
}
