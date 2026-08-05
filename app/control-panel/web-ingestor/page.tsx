import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin";
import { WebIngestorPairing } from "@/components/admin/web-ingestor-pairing";
import { getTopicWorkspace } from "@/lib/admin/content-structure";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Web Ingestor | Scout Admin",
  description: "Pair the browser extension to capture login-protected web pages into a folder."
};

export default async function WebIngestorPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.contentStructure);

  const workspace = await getTopicWorkspace(session);
  const folders = workspace.topics
    .filter((topic) => topic.companyId === session.user.tenantId)
    .map((topic) => ({ id: topic.id, name: topic.name }));

  return (
    <AdminShell active={MODULE_KEYS.contentStructure} session={session}>
      <WebIngestorPairing folders={folders} />
    </AdminShell>
  );
}
