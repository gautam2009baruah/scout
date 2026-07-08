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

  const [masterDataResult, guidesResult, targetAppsResult, recordingSessionsResult] = await Promise.allSettled([
    getMasterData(),
    listGuidedWorkflows(session),
    listGuidedWorkflowTargetApps(session),
    listGuidedWorkflowRecordingSessions(session)
  ]);

  const companies = masterDataResult.status === "fulfilled" ? masterDataResult.value.companies : [];
  const guides = guidesResult.status === "fulfilled" ? guidesResult.value : [];
  const targetApps = targetAppsResult.status === "fulfilled" ? targetAppsResult.value : [];
  const recordingSessions = recordingSessionsResult.status === "fulfilled" ? recordingSessionsResult.value : [];

  if (masterDataResult.status === "rejected") {
    console.error("Failed to load guided workflows master data", masterDataResult.reason);
  }

  if (guidesResult.status === "rejected") {
    console.error("Failed to load guided workflows", guidesResult.reason);
  }

  if (targetAppsResult.status === "rejected") {
    console.error("Failed to load guided workflow target apps", targetAppsResult.reason);
  }

  if (recordingSessionsResult.status === "rejected") {
    console.error("Failed to load guided workflow recording sessions", recordingSessionsResult.reason);
  }

  return (
    <AdminShell active={MODULE_KEYS.guidedWorkflows} session={session}>
      <GuidedWorkflowManager companies={companies} guides={guides} recordingSessions={recordingSessions} targetApps={targetApps} />
    </AdminShell>
  );
}
