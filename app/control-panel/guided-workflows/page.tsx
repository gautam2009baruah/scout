import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, GuidedWorkflowManager } from "@/components/admin";
import { getMasterData } from "@/lib/admin/administration";
import { listGuidedWorkflowRecordingSessions, listGuidedWorkflows, listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Guided Workflows | Scout",
  description: "Record, edit, publish, and export guided product walkthroughs."
};

export default async function GuidedWorkflowsPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

  const [{ companies }, guides, targetApps, recordingSessions] = await Promise.all([
    getMasterData(),
    listGuidedWorkflows(session),
    listGuidedWorkflowTargetApps(session),
    listGuidedWorkflowRecordingSessions(session)
  ]);

  return (
    <AdminShell active={MODULE_KEYS.guidedWorkflows} session={session} title="Guided Workflows">
      <GuidedWorkflowManager companies={companies} guides={guides} recordingSessions={recordingSessions} targetApps={targetApps} />
    </AdminShell>
  );
}
