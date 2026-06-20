import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/admin";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Change Password | Scout Admin",
  description: "Change your temporary Scout Control Panel password."
};

export default async function ChangePasswordPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (!session.user.mustChangePassword) {
    redirect("/control-panel");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4 py-10 text-slate-950">
      <div className="w-full max-w-md">
        <ChangePasswordForm />
      </div>
    </main>
  );
}
