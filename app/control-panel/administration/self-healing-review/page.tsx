import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, HealingSuggestionReviewer } from "@/components/admin";
import { listGuidedWorkflowRecordingSessions, listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Self-Healing Review | Scout Admin",
  description: "Review guided workflow self-healing suggestions across training sessions."
};

export default async function SelfHealingReviewPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

  const [targetApps, recordingSessions] = await Promise.all([
    listGuidedWorkflowTargetApps(session),
    listGuidedWorkflowRecordingSessions(session)
  ]);

  return (
    <AdminShell active={MODULE_KEYS.workflowSelfHealingReview} session={session}>
      <HealingSuggestionReviewer
        displayMode="table"
        recordingSessions={recordingSessions}
        selectedCompanyId={session.user.tenantId}
        targetApps={targetApps}
      />
    </AdminShell>
  );
}
