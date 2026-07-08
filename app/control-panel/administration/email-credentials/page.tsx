import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin";
import { EmailCredentialsManager } from "@/components/admin/email-credentials-manager";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Email Credentials | Scout",
  description: "Manage email credentials for email triggers in orchestrations."
};

export default async function EmailCredentialsPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  requireModuleAccess(session, MODULE_KEYS.administration);

  return (
    <AdminShell active={MODULE_KEYS.emailCredentials} session={session}>
      <EmailCredentialsManager />
    </AdminShell>
  );
}
