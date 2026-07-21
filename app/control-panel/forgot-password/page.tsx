import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/admin";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Forgot Password | Scout",
  description: "Reset your Scout control panel password."
};

const steps = [
  {
    icon: Mail,
    title: "Confirm your email",
    description: "Tell us the address on file for your account."
  },
  {
    icon: KeyRound,
    title: "Get a secure link",
    description: "We'll send a one-time link that expires after an hour."
  },
  {
    icon: ShieldCheck,
    title: "Set a new password",
    description: "Choose a new password and get back to your workspace."
  }
];

export default function ForgotPasswordPage() {
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
              Let&apos;s get you back into your workspace.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              Reset your password in a few quick steps and pick up right where you left off.
            </p>
          </div>

          <div className="relative grid gap-3 xl:grid-cols-3">
            {steps.map((item) => (
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

            <ForgotPasswordForm />
          </div>
        </section>
      </div>
    </main>
  );
}
