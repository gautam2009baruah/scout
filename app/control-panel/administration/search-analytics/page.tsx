import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, SearchAnalyticsDashboard } from "@/components/admin";
import { listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Chatbot Analytics | Scout Admin",
  description: "Analytics for chatbot quality, retrieval, latency, and feedback."
};

export default async function SearchAnalyticsPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.searchAnalytics);

  const targetApps = await listGuidedWorkflowTargetApps(session);

  return (
    <AdminShell active={MODULE_KEYS.searchAnalytics} session={session}>
      <SearchAnalyticsDashboard
        selectedCompanyId={session.user.tenantId}
        targetApps={targetApps.map((app) => ({ id: app.id, name: app.name, companyId: app.companyId }))}
      />
    </AdminShell>
  );
}
