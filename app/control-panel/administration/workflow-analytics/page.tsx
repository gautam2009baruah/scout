import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, WorkflowAnalyticsDashboard } from "@/components/admin";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Workflow Analytics | Scout Admin",
  description: "Analytics for guided workflow playback executions."
};

export default async function WorkflowAnalyticsPage() {
  const session = await getCurrentAdminSession();

  if (!session) redirect("/control-panel/login");
  if (session.user.mustChangePassword) redirect("/control-panel/change-password");

  requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

  return (
    <AdminShell active={MODULE_KEYS.guidedWorkflows} activeHref="/control-panel/administration/workflow-analytics" session={session} title="Workflow Analytics">
      <WorkflowAnalyticsDashboard />
    </AdminShell>
  );
}
