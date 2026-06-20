import type { Metadata } from "next";
import { AccountActivationForm } from "@/components/admin/account-activation-form";

export const metadata: Metadata = {
  title: "Activate Account | Scout",
  description: "Activate your Scout account."
};

type ActivatePageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const { token = "" } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4 py-10 text-slate-950">
      <div className="w-full max-w-md">
        <AccountActivationForm token={token} />
      </div>
    </main>
  );
}
