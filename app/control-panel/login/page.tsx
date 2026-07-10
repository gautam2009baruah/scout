import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin";
import { Compass, FileUp, ShieldCheck, UsersRound } from "lucide-react";

export const metadata: Metadata = {
  title: "Control Panel Login | Scout",
  description: "Secure sign in for Scout control panel access."
};

const foundations = [
  {
    icon: Compass,
    title: "Centralized operations",
    description: "Monitor activity, review performance, and keep teams aligned from one workspace."
  },
  {
    icon: UsersRound,
    title: "Organization aware",
    description: "Everything stays scoped to your selected organization to keep work clear and focused."
  },
  {
    icon: FileUp,
    title: "Ready for execution",
    description: "Manage workflows, documents, users, and approvals with confidence."
  }
];

export default function AdminLoginPage() {
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
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-200">Unified operations hub</p>
            <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-normal">
              Run your daily operations from one secure control panel.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              Keep teams productive with a clear workspace for orchestrations, content, users, and approvals.
            </p>
          </div>

          <div className="relative grid gap-3 xl:grid-cols-3">
            {foundations.map((item) => (
              <article className="rounded-lg border border-white/10 bg-white/8 p-4 backdrop-blur" key={item.title}>
                <item.icon className="h-5 w-5 text-teal-200" />
                <h2 className="mt-3 text-sm font-semibold text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
              </article>
            ))}
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

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft-xl sm:p-8">
              <div className="mb-7">
                <p className="text-sm font-medium text-teal-700">Secure access</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">Sign in to control panel</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Enter your credentials to continue.
                </p>
              </div>
              <AdminLoginForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
