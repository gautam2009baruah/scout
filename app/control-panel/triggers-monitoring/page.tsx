import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, TriggersMonitoringDashboard } from "@/components/admin";
import { listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Triggers Monitoring | Scout",
  description: "Monitor and manage orchestration triggers."
};

export default async function TriggersMonitoringPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  // Require triggers monitoring access
  requireModuleAccess(session, MODULE_KEYS.triggersMonitoring);

  const targetApps = await listGuidedWorkflowTargetApps(session);

  return (
    <AdminShell active={MODULE_KEYS.triggersMonitoring} session={session}>
      <TriggersMonitoringDashboard
        selectedCompanyId={session.user.tenantId}
        targetApps={targetApps.map((app) => ({ id: app.id, name: app.name, companyId: app.companyId }))}
      />
    </AdminShell>
  );
}
