import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin";
import { DatabaseSchemaManager } from "@/components/admin/database-schema-manager";
import { getDatabaseSchemaAdminPayload } from "@/lib/admin/database-schemas";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Database Schema Manager | Scout",
  description: "Upload and configure target-app database schemas for database nodes.",
};

export default async function DatabaseSchemaManagerPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.databaseSchemaManager);

  const payload = await getDatabaseSchemaAdminPayload(session);

  return (
    <AdminShell active={MODULE_KEYS.databaseSchemaManager} session={session}>
      <DatabaseSchemaManager
        companyName={session.tenant.name}
        targetApps={payload.targetApps}
        catalog={payload.catalog}
      />
    </AdminShell>
  );
}
