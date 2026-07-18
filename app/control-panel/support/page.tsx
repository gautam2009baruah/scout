import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { AdminShell } from "@/components/admin";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Support | Scout",
  description: "Scout Control Panel support information.",
};

export default async function SupportPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  return (
    <AdminShell active={0} session={session} title="Support">
      <section className="border border-slate-300 bg-white p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center bg-blue-700 text-white">
            <CircleHelp className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Support</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              For access, configuration, or runtime assistance, contact your Scout system administrator.
            </p>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
