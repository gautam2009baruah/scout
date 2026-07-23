import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, GuidedWorkflowTrainingSetup } from "@/components/admin";
import { getMasterData, listCompanyTargetApplications } from "@/lib/admin/administration";
import { listGuidedWorkflowRecordingSessions } from "@/lib/admin/guided-workflows";
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

  const [{ companies }, companyTargetApplications, recordingSessions] = await Promise.all([
    getMasterData(),
    listCompanyTargetApplications(session),
    listGuidedWorkflowRecordingSessions(session)
  ]);
  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

  return (
    <AdminShell active={MODULE_KEYS.workflowTrainingSetup} session={session}>
      <GuidedWorkflowTrainingSetup
        appBaseUrl={appBaseUrl}
        companies={companies}
        recordingSessions={recordingSessions}
        selectedCompanyId={session.user.tenantId}
        targetApps={companyTargetApplications}
      />
    </AdminShell>
  );
}
