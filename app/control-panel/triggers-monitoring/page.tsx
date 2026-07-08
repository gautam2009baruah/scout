import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, TriggersMonitoringDashboard } from "@/components/admin";
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

  // Require guided workflows access (triggers are part of orchestrations)
  await requireModuleAccess(MODULE_KEYS.guidedWorkflows);

  return (
    <AdminShell activeModule="orchestration-monitoring">
      <TriggersMonitoringDashboard />
    </AdminShell>
  );
}
