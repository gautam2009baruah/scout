import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin";
import { HelpCenter } from "@/components/admin/help-center";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Help Center | Scout",
  description: "Guided help for every Scout Control Panel page and control.",
};

export default async function HelpPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  return (
    <AdminShell active={0} session={session} title="Help Center">
      <HelpCenter />
    </AdminShell>
  );
}
