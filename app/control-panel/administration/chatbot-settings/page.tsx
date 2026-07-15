import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, ChatbotSettingsForm } from "@/components/admin";
import { getChatbotLifecycleSettingsAdminPayload } from "@/lib/admin/chatbot-settings";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Chatbot Settings | Scout",
  description: "Configure chatbot conversation lifecycle and context limits globally or per target application."
};

export default async function ChatbotSettingsPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.chatbotSettings);
  const payload = await getChatbotLifecycleSettingsAdminPayload(session);

  return (
    <AdminShell active={MODULE_KEYS.chatbotSettings} session={session}>
      <ChatbotSettingsForm
        companyName={session.tenant.name}
        defaults={payload.defaults}
        initialSettings={payload.settings}
        canUseCompanyLevelApiKeys={payload.canUseCompanyLevelApiKeys}
        targetApps={payload.targetApps}
      />
    </AdminShell>
  );
}
