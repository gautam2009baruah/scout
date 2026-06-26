import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, GuidedWorkflowTrainingSetup } from "@/components/admin";
import { getMasterData } from "@/lib/admin/administration";
import { listGuidedWorkflowRecordingSessions, listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Training Setup | Scout Admin",
  description: "Configure target apps, training sessions, and recorder plugin downloads."
};

export default async function TrainingSetupPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

  const [{ companies }, targetApps, recordingSessions] = await Promise.all([
    getMasterData(),
    listGuidedWorkflowTargetApps(session),
    listGuidedWorkflowRecordingSessions(session)
  ]);

  return (
    <AdminShell active={MODULE_KEYS.administration} session={session} title="Training Setup">
      <GuidedWorkflowTrainingSetup companies={companies} recordingSessions={recordingSessions} targetApps={targetApps} />
    </AdminShell>
  );
}
