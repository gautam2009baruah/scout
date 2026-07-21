import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/admin";
import { LockKeyhole, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Reset Password | Scout",
  description: "Set a new password for your Scout account."
};

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token = "" } = await searchParams;

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.58fr)]">
        <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(20,184,166,0.24),transparent_28%),radial-gradient(circle_at_84%_14%,rgba(248,113,113,0.18),transparent_26%),linear-gradient(140deg,#020617_0%,#111827_48%,#162033_100%)]" />
          <div className="relative flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-950">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-normal">Scout Control Panel</span>
          </div>

          <div className="relative max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-200">Account recovery</p>
            <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-normal">
              Choose a new password to secure your account.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              Pick something strong and memorable. You&apos;ll use it the next time you sign in.
            </p>
          </div>

          <div className="relative flex items-center gap-3 rounded-lg border border-white/10 bg-white/8 p-4 backdrop-blur">
            <LockKeyhole className="h-5 w-5 text-teal-200" />
            <p className="text-sm leading-6 text-slate-300">
              This link is single-use and expires an hour after it was requested.
            </p>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="text-lg font-semibold tracking-normal">Scout Control Panel</span>
            </div>

            <ResetPasswordForm token={token} />
          </div>
        </section>
      </div>
    </main>
  );
}
