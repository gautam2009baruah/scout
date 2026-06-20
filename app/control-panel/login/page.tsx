import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin";
import { Database, FileUp, ShieldCheck, UsersRound } from "lucide-react";

export const metadata: Metadata = {
  title: "Admin Login | Scout",
  description: "Secure admin sign in for Scout multi-tenant operations."
};

const foundations = [
  {
    icon: Database,
    title: "Database flexible",
    description: "PostgreSQL-ready contracts with room for client-provided database adapters."
  },
  {
    icon: UsersRound,
    title: "Tenant aware",
    description: "Tenant context is part of the admin boundary from the first screen."
  },
  {
    icon: FileUp,
    title: "Operations ready",
    description: "Built to grow into file uploads, user registration, audits, and settings."
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
            <span className="text-lg font-semibold tracking-normal">Scout Admin</span>
          </div>

          <div className="relative max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-200">Multi-tenant control plane</p>
            <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-normal">
              Manage customers, files, users, and platform operations from one secure console.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              The admin surface is isolated from the chatbot wizard and structured so authentication, tenancy, and persistence can evolve independently.
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
              <span className="text-lg font-semibold tracking-normal">Scout Admin</span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft-xl sm:p-8">
              <div className="mb-7">
                <p className="text-sm font-medium text-teal-700">Secure access</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">Sign in to admin</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Use the first admin account created by your database setup task.
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
