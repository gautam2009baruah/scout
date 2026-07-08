// Orchestration Designer page
// Main entry point for the visual workflow designer

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin";
import { OrchestrationDesigner } from "@/components/admin/orchestration-designer";
import { getMasterData } from "@/lib/admin/administration";
import { listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Orchestration Designer | Scout Admin",
  description: "Visual drag-and-drop workflow orchestration designer"
};

export default async function OrchestrationDesignerPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.orchestrationDesigner);

  const [{ companies }, targetApps] = await Promise.all([
    getMasterData(),
    listGuidedWorkflowTargetApps(session),
  ]);

  return (
    <AdminShell
      active={MODULE_KEYS.orchestrationDesigner}
      session={session}
    >
      <OrchestrationDesigner companies={companies} targetApps={targetApps} />
    </AdminShell>
  );
}
