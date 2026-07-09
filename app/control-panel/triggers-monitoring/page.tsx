import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, TriggersMonitoringDashboard } from "@/components/admin";
import { getMasterData } from "@/lib/admin/administration";
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

  const [{ companies }, targetApps] = await Promise.all([
    getMasterData(),
    listGuidedWorkflowTargetApps(session),
  ]);

  return (
    <AdminShell active={MODULE_KEYS.triggersMonitoring} session={session}>
      <TriggersMonitoringDashboard
        companies={companies.map((company) => ({ id: company.id, name: company.name }))}
        targetApps={targetApps.map((app) => ({ id: app.id, name: app.name, companyId: app.companyId }))}
      />
    </AdminShell>
  );
}
