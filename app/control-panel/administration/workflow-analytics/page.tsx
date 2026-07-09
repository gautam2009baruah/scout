import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, WorkflowAnalyticsDashboard } from "@/components/admin";
import { getMasterData } from "@/lib/admin/administration";
import { listGuidedWorkflowRecordingSessions, listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";
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

  const [{ companies }, targetApps, recordingSessions] = await Promise.all([
    getMasterData(),
    listGuidedWorkflowTargetApps(session),
    listGuidedWorkflowRecordingSessions(session)
  ]);

  return (
    <AdminShell active={MODULE_KEYS.workflowAnalytics} session={session}>
      <WorkflowAnalyticsDashboard companies={companies} recordingSessions={recordingSessions} targetApps={targetApps} />
    </AdminShell>
  );
}
