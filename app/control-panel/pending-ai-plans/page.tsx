// Pending AI Plans page — Step 7b's admin approval queue entry point.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin";
import { PendingAiPlans } from "@/components/admin/pending-ai-plans";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Pending AI Plans | Scout Admin",
  description: "Review and approve or reject draft plans submitted by the AI Planner"
};

export default async function PendingAiPlansPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.pendingAiPlans);

  return (
    <AdminShell active={MODULE_KEYS.pendingAiPlans} session={session}>
      <PendingAiPlans />
    </AdminShell>
  );
}
